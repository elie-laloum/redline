import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { loadConfig } from "../lib/config.ts";
import { fail } from "../lib/errors.ts";
import { getTicket as fetchJira } from "../lib/jira.ts";
import { lockPath } from "../lib/paths.ts";
import { anyValue, bool, obj, str } from "../lib/schema.ts";
import { type Json, patchTicketState, readTicketState, ticketStateExists } from "../lib/store.ts";
import { fuseTicket, normalizeKey } from "../lib/ticket.ts";
import { type AnyTool, defineTool } from "../lib/tool.ts";

export const stateTools: AnyTool[] = [
  defineTool({
    name: "get-store-ticket",
    description:
      "Lit l'etat local d'un ticket dans ~/.autopilot/tickets/<ticket-id>.yaml : phase, etape, repo courant, compteurs de boucle, branches, tags publies, contradictions memoire. Rend null si le ticket n'a jamais ete lance.",
    inputSchema: obj({ ticketId: str("Cle Jira, par exemple FT-1025.") }, ["ticketId"]),
    handler: ({ ticketId }: { ticketId: string }) => {
      const state = readTicketState(ticketId);
      return state ?? { exists: false, ticketId, note: "Aucun etat local : c'est un premier lancement." };
    },
  }),

  defineTool({
    name: "write-store-ticket",
    description:
      "Seul ecrivain de l'etat d'un ticket. Ecrit en merge/patch : ne transmets QUE les champs qui changent. Un champ absent du patch est conserve, un champ a null est efface, {__replace: [...]} remplace une liste entiere et {__increment: 1} ajoute a un compteur. A appeler a chaque transition d'etape — c'est la seule chose qui rend la reprise possible.",
    inputSchema: obj(
      {
        ticketId: str("Cle Jira, par exemple FT-1025."),
        patch: anyValue("Objet partiel a fusionner dans l'etat. Les listes d'objets fusionnent par name / id / repo."),
      },
      ["ticketId", "patch"],
    ),
    handler: ({ ticketId, patch }: { ticketId: string; patch: Json }) => {
      if (typeof patch !== "object" || patch === null || Array.isArray(patch)) {
        fail("`patch` doit etre un objet.", "Un patch est un fragment d'etat, pas une valeur isolee.");
      }
      guardStep(patch);
      guardBudgets(ticketId, patch);
      const merged = patchTicketState(ticketId, patch);
      return { written: true, state: merged };
    },
  }),

  defineTool({
    name: "get-ticket",
    description:
      "Le ticket complet : contenu Jira fusionne avec l'etat local du run. Jira fait autorite sur le titre, la description, les criteres d'acceptation et le statut ; le store fait autorite sur le scope, l'etape courante, les compteurs et les tags. Les deux ne se recouvrent pas.",
    inputSchema: obj(
      {
        ticketId: str("Cle Jira ou URL du ticket."),
        storeOnly: bool("Ne lire que l'etat local, sans appeler Jira. Utile en reprise quand le reseau est douteux."),
      },
      ["ticketId"],
    ),
    handler: async ({ ticketId, storeOnly }: { ticketId: string; storeOnly?: boolean }) => {
      const key = normalizeKey(ticketId);
      const store = readTicketState(key);
      const jira = storeOnly ? null : await fetchJira(key);
      return fuseTicket(key, jira, store);
    },
  }),

  defineTool({
    name: "acquire-ticket-lock",
    description:
      "Pose le lock de run sur un ticket. Echoue immediatement si le lock est deja pris : deux runs simultanes sur le meme ticket se marcheraient dessus dans le meme worktree. A appeler au demarrage de l'orchestration, avant toute autre action.",
    inputSchema: obj(
      { ticketId: str("Cle Jira."), runId: str("Identifiant du run, pour tracer qui detient le lock.") },
      ["ticketId", "runId"],
    ),
    handler: ({ ticketId, runId }: { ticketId: string; runId: string }) => {
      const path = lockPath(ticketId);
      mkdirSync(dirname(path), { recursive: true });
      if (existsSync(path)) {
        const holder = safeRead(path);
        // Un verrou dont le detenteur est mort n'est pas un verrou, c'est un
        // debris. Il restait a effacer a la main, et c'etait la premiere chose
        // a faire apres chaque run tue net — un nettoyage manuel impose par un
        // fichier que le programme pouvait tres bien verifier lui-meme.
        const stale = deadHolder(holder);
        if (!stale) {
          fail(
            `Le ticket ${ticketId} est deja verrouille.`,
            `Detenu par : ${holder}. Si ce run tourne vraiment, attends-le ; sinon supprime ${path}.`,
          );
        }
        rmSync(path, { force: true });
      }
      const holder = { runId, pid: process.pid, at: new Date().toISOString() };
      // `wx` echoue si le fichier apparait entre le test et l'ecriture.
      try {
        writeFileSync(path, `${JSON.stringify(holder, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
      } catch {
        fail(`Le ticket ${ticketId} vient d'etre verrouille par un autre run.`);
      }
      return { locked: true, ...holder };
    },
  }),

  defineTool({
    name: "release-ticket-lock",
    description:
      "Libere le lock de run d'un ticket. A appeler a la fin du run, y compris apres une escalade : un lock oublie bloque la reprise.",
    inputSchema: obj({ ticketId: str("Cle Jira.") }, ["ticketId"]),
    handler: ({ ticketId }: { ticketId: string }) => {
      const path = lockPath(ticketId);
      const existed = existsSync(path);
      if (existed) rmSync(path);
      return { released: existed, ticketId };
    },
  }),
];



/**
 * Le detenteur du verrou est-il encore en vie ?
 *
 * `process.kill(pid, 0)` ne tue rien : il demande au noyau si le process
 * existe. Sans pid lisible on repond non — un verrou qu'on ne sait pas dater
 * est plus dangereux a reprendre qu'a garder, et l'humain tranchera.
 */
function deadHolder(holder: string): boolean {
  let pid: unknown;
  try {
    pid = (JSON.parse(holder) as { pid?: unknown }).pid;
  } catch {
    return false;
  }
  if (typeof pid !== "number" || !Number.isFinite(pid) || pid <= 1) return false;
  try {
    process.kill(pid, 0);
    return false;
  } catch (error) {
    // EPERM : il existe mais appartient a quelqu'un d'autre. On ne le reprend pas.
    return (error as NodeJS.ErrnoException).code === "ESRCH";
  }
}

function safeRead(path: string): string {
  try {
    return readFileSync(path, "utf8").trim();
  } catch {
    return "illisible";
  }
}

export { ticketStateExists };

/**
 * `run.step` est un numero de point, et rien d'autre.
 *
 * Le champ est du texte libre dans un YAML, ecrit par un agent. Un jour il a
 * recu `"4 - functional-grill"` — le point **et** le nom de l'agent — et le live
 * shell a repondu qu'il attendait toujours son premier event : treize etapes
 * eteintes pendant que le run tournait. Le shell sait maintenant lire par
 * dessus, mais un curseur de reprise qui contient une annotation reste un
 * curseur qu'on ne peut pas comparer. On refuse ici, ou l'erreur est encore
 * corrigeable par celui qui l'a faite.
 */
const STEP_VALUE = /^([1-9]|1[0-3])(\.\d+)?$/;

function guardStep(patch: Json): void {
  const run = (patch as { run?: unknown }).run;
  if (typeof run !== "object" || run === null || Array.isArray(run)) return;
  const step = (run as { step?: unknown }).step;
  if (step === undefined || step === null) return;

  const value = typeof step === "number" ? String(step) : typeof step === "string" ? step.trim() : "";
  if (STEP_VALUE.test(value)) return;

  fail(
    `\`run.step\` vaut ${JSON.stringify(step)}, ce qui n'est pas un numero de point.`,
    "Ecris le point seul — `4`, ou `10.4` pour une sous-etape du cycle d'implementation. Ce que fait l'etape se dit dans le `title` de ton event, pas dans le curseur.",
  );
}

/**
 * Un compteur de boucle ne depasse pas son budget. Jamais.
 *
 * Le plafond etait une consigne de prompt, et une consigne de prompt se rate :
 * sur FT-1042, `redChecker` est monte a 4 pour un budget de 3, puis le run
 * s'est arrete en annoncant « budgets epuises » — un diagnostic faux, puisque
 * les tours supplementaires n'avaient rien converge, ils avaient seulement ete
 * debites. Le compteur est de l'etat : c'est ici qu'il se defend.
 *
 * Le refus arrive AVANT l'ecriture. L'orchestrateur reprend donc la main avec
 * un compteur intact et une seule issue, celle qu'il aurait du prendre tout
 * seul : `escalate-to-human`.
 */
function guardBudgets(ticketId: string, patch: Json): void {
  const entries = (patch as { scope?: unknown }).scope;
  if (!Array.isArray(entries)) return;

  const budgets = loadConfig().budgets as unknown as Record<string, number | undefined>;
  const state = readTicketState(ticketId);
  const base = Array.isArray((state as { scope?: unknown } | null)?.scope)
    ? ((state as { scope: Json[] }).scope as Json[])
    : [];

  for (const entry of entries) {
    if (!isObject(entry)) continue;
    const loops = entry.loops;
    if (!isObject(loops)) continue;

    const name = typeof entry.name === "string" ? entry.name : typeof entry.repo === "string" ? entry.repo : null;
    const current = base.find(
      (candidate) => isObject(candidate) && (candidate.name === name || candidate.repo === name),
    );
    const currentLoops = isObject(current) && isObject(current.loops) ? current.loops : {};

    for (const [loop, value] of Object.entries(loops)) {
      const budget = budgets[loop];
      if (typeof budget !== "number") continue;

      const before = typeof currentLoops[loop] === "number" ? (currentLoops[loop] as number) : 0;
      const after = nextCount(before, value);
      if (after === null || after <= budget) continue;

      fail(
        `\`${loop}\` passerait a ${after} sur ${name ?? "ce repo"}, pour un budget de ${budget}.`,
        "Le budget est atteint : ce tour ne s'ouvre pas. Appelle `escalate-to-human` avec le detail de ce qui n'a pas converge. " +
          "Si la boucle s'est arretee sans rendre de verdict — environnement, harnais de test, sortie illisible — elle ne se debite pas : n'incremente rien et escalade avec `cause: environment`.",
      );
    }
  }
}

function nextCount(before: number, value: Json): number | null {
  if (typeof value === "number") return value;
  if (isObject(value) && typeof value.__increment === "number") return before + value.__increment;
  return null;
}

function isObject(value: unknown): value is { [key: string]: Json } {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
