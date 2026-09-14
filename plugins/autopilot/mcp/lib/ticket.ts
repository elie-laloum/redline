import { squadOf } from "./config.ts";
import type { JiraTicket } from "./jira.ts";
import type { Json } from "./store.ts";

/**
 * La fusion Jira / store.
 *
 * Elle est deterministe parce que les deux sources **ne se recouvrent pas** :
 * Jira fait autorite sur le contenu du ticket, le store sur l'etat du run. Il
 * n'y a donc jamais d'arbitrage a rendre, et c'est exactement ce qui rend cette
 * fonction testable sans reseau.
 */

export interface FusedTicket {
  readonly key: string;
  readonly squad: string;
  readonly jira: Omit<JiraTicket, "key"> | null;
  readonly store: Json | null;
  readonly resumable: boolean;
  readonly resumeAt: { phase: unknown; step: unknown; currentRepo: unknown } | null;
  /** Champs du store contredits par Jira : ils signalent un ticket qui a bouge. */
  readonly diverged: readonly string[];
}

export function fuseTicket(key: string, jira: JiraTicket | null, store: Json | null): FusedTicket {
  const stored = asObject(store);
  const storedTicket = asObject(stored?.ticket ?? null);

  const diverged: string[] = [];
  if (jira && storedTicket) {
    // Le titre sert a construire branches, MR et canal : s'il a change depuis
    // l'approbation du plan, on ne renomme rien en douce, on le signale.
    if (typeof storedTicket.title === "string" && storedTicket.title !== jira.title) diverged.push("title");
    if (typeof storedTicket.statusAtStart === "string" && storedTicket.statusAtStart !== jira.status) {
      diverged.push("status");
    }
  }

  return {
    key,
    squad: squadOf(key),
    jira: jira
      ? {
          title: jira.title,
          description: jira.description,
          acceptanceCriteria: jira.acceptanceCriteria,
          issueType: jira.issueType,
          status: jira.status,
          url: jira.url,
          labels: jira.labels,
          links: jira.links,
          attachments: jira.attachments,
        }
      : null,
    store,
    resumable: store !== null,
    resumeAt: readCursor(store),
    diverged,
  };
}

/** Le curseur de reprise : phase, etape, repo. Rien d'autre n'est necessaire. */
export function readCursor(state: Json | null): { phase: unknown; step: unknown; currentRepo: unknown } | null {
  const run = asObject(asObject(state)?.run ?? null);
  if (!run) return null;
  return { phase: run.phase, step: run.step, currentRepo: run.currentRepo };
}

/** `FT-1025`, `ft-1025`, ou l'URL complete : la meme cle en sort. */
export function normalizeKey(input: string): string {
  const fromUrl = /\/browse\/([A-Za-z][A-Za-z0-9_]*-\d+)/.exec(input);
  const key = (fromUrl?.[1] ?? input).trim().toUpperCase();
  squadOf(key); // valide la forme, echoue avec un message clair sinon
  return key;
}

function asObject(value: Json | null): Record<string, Json> | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  return value as Record<string, Json>;
}
