import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { squadOf } from "../lib/config.ts";
import { fail } from "../lib/errors.ts";
import { getTicket as fetchJira } from "../lib/jira.ts";
import { lockPath } from "../lib/paths.ts";
import { anyValue, bool, obj, str } from "../lib/schema.ts";
import { type Json, patchTicketState, readTicketState, ticketStateExists } from "../lib/store.ts";
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

      if (storeOnly) {
        return { key, squad: squadOf(key), jira: null, store, resumable: store !== null };
      }

      const jira = await fetchJira(key);
      return {
        key,
        squad: squadOf(key),
        // Jira fait autorite ici.
        jira: {
          title: jira.title,
          description: jira.description,
          acceptanceCriteria: jira.acceptanceCriteria,
          issueType: jira.issueType,
          status: jira.status,
          url: jira.url,
          labels: jira.labels,
          links: jira.links,
          attachments: jira.attachments,
        },
        // Le store fait autorite la.
        store,
        resumable: store !== null,
        resumeAt: store ? readCursor(store) : null,
      };
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
        fail(
          `Le ticket ${ticketId} est deja verrouille.`,
          `Detenu par : ${holder}. Si ce run est mort, supprime ${path} puis relance.`,
        );
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

function normalizeKey(input: string): string {
  const fromUrl = /\/browse\/([A-Za-z][A-Za-z0-9_]*-\d+)/.exec(input);
  const key = (fromUrl?.[1] ?? input).trim().toUpperCase();
  squadOf(key); // valide la forme, echoue avec un message clair sinon
  return key;
}

/** Le curseur de reprise : phase, etape, repo. Rien d'autre n'est necessaire. */
function readCursor(state: Json): { phase: unknown; step: unknown; currentRepo: unknown } | null {
  if (typeof state !== "object" || state === null || Array.isArray(state)) return null;
  const run = (state as Record<string, Json>).run;
  if (typeof run !== "object" || run === null || Array.isArray(run)) return null;
  const record = run as Record<string, Json>;
  return { phase: record.phase, step: record.step, currentRepo: record.currentRepo };
}

function safeRead(path: string): string {
  try {
    return readFileSync(path, "utf8").trim();
  } catch {
    return "illisible";
  }
}

export { ticketStateExists };
