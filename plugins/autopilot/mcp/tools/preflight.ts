import { existsSync } from "node:fs";
import { containerNeedsOf, findRepo, loadConfig } from "../lib/config.ts";
import { ensureImages, runtimeStatus, startRuntime } from "../lib/containers.ts";
import { fail } from "../lib/errors.ts";
import { worktreePath } from "../lib/paths.ts";
import { obj, str } from "../lib/schema.ts";
import { type AnyTool, defineTool } from "../lib/tool.ts";

/**
 * Le pre-vol d'un repo : ce qui doit repondre avant qu'un test ait le droit
 * d'echouer.
 *
 * Une panne d'environnement decouverte au milieu du cycle coute bien plus que
 * le temps qu'elle prend. Elle arrive deguisee en echec de test, elle traverse
 * le `red-checker` puis le `developer`, et il faut un humain pour trancher que
 * personne n'avait tort. Decouverte ici, elle n'est qu'une ligne de sortie.
 */
export const preflightTools: AnyTool[] = [
  defineTool({
    name: "preflight-repo",
    description:
      "Verifie que la machine peut faire tourner les tests du repo : runtime de conteneurs debout, images du registre deja tirees. " +
      "A appeler une fois par repo, apres setup-repo et avant le premier test. Un repo qui ne declare pas de conteneurs rend ok sans rien faire.",
    inputSchema: obj(
      {
        ticketId: str("Cle Jira, elle designe le worktree."),
        repo: str("Nom du repo dans le registre."),
      },
      ["ticketId", "repo"],
    ),
    handler: async ({ ticketId, repo: name }: { ticketId: string; repo: string }, context) => {
      const repo = findRepo(name);
      const cwd = worktreePath(ticketId, repo.name);
      if (!existsSync(cwd)) fail(`Worktree absent : ${cwd}.`, "Appelle create-worktree puis setup-repo d'abord.");

      const needs = containerNeedsOf(repo);
      if (!needs.required && needs.images.length === 0) {
        return {
          repo: repo.name,
          ready: true,
          containers: { required: false },
          note: "Ce repo ne declare aucun besoin de conteneurs : rien a verifier.",
        };
      }

      const timeouts = loadConfig().timeouts;
      context.heartbeat(`pre-vol ${repo.name} : runtime de conteneurs`);

      let status = await runtimeStatus(cwd);
      let started = false;
      if (!status.available) {
        context.heartbeat(`pre-vol ${repo.name} : aucun runtime, tentative de demarrage`);
        status = await startRuntime(cwd, timeouts.containerStartSeconds * 1000);
        started = status.available;
      }

      if (!status.available) {
        return {
          repo: repo.name,
          ready: false,
          containers: { required: needs.required, runtime: status },
          blocking: needs.required,
          reason: status.detail,
          note:
            "Les tests de ce repo montent des conteneurs. Sans runtime, ils ne rendront pas un echec : " +
            "ils resteront muets jusqu'au plafond. Escalade plutot que de lancer quoi que ce soit.",
        };
      }

      const images = needs.images.length
        ? await ensureImages(cwd, status.cli ?? "docker", needs.images, timeouts.imagePullSeconds * 1000)
        : [];
      const missing = images.filter((image) => !image.present);

      context.heartbeat(`pre-vol ${repo.name} : ${images.length - missing.length}/${images.length} images pretes`);

      return {
        repo: repo.name,
        ready: missing.length === 0,
        containers: { required: needs.required, runtime: status, startedByPreflight: started, images },
        blocking: missing.length > 0 && needs.required,
        reason: missing.length ? `Images indisponibles : ${missing.map((image) => image.image).join(", ")}.` : null,
        note: missing.length
          ? "Une image absente se retire pendant la premiere suite de tests, ou elle est indiscernable d'un test lent."
          : "Runtime debout et images en cache : la premiere suite de tests ne paiera pas le telechargement.",
      };
    },
  }),
];
