import type { RepoEntry } from "./config.ts";
import type { TicketSnapshot } from "./ticket.ts";

export interface ScopeEntry {
  readonly repo: string;
  readonly level: number;
  readonly area: string;
  readonly evidence: readonly string[];
}

export interface Exclusion {
  readonly repo: string;
  readonly reason: string;
}

export interface Scope {
  readonly impacted: readonly ScopeEntry[];
  readonly excluded: readonly Exclusion[];
}

export interface Contradiction {
  readonly note: string;
  readonly claim: string;
  readonly evidence: string;
  readonly raisedBy: string;
}

export function preselect(repos: readonly RepoEntry[], ticket: Pick<TicketSnapshot, "title" | "description">, extra = ""): { candidates: RepoEntry[]; skipped: Exclusion[] } {
  const haystack = normalize(`${ticket.title}\n${ticket.description}\n${extra}`);
  const hits = new Set(repos.filter((repo) => [repo.name, ...repo.keywords].some((word) => haystack.includes(normalize(word)))).map((repo) => repo.name));
  if (hits.size === 0) return { candidates: [...repos], skipped: [] };
  const neighbours = new Set(hits);
  for (const repo of repos) {
    if (hits.has(repo.name)) for (const upstream of repo.dependsOn) neighbours.add(upstream);
    if (repo.dependsOn.some((upstream) => hits.has(upstream))) neighbours.add(repo.name);
  }
  return {
    candidates: repos.filter((repo) => neighbours.has(repo.name)),
    skipped: repos.filter((repo) => !neighbours.has(repo.name)).map((repo) => ({ repo: repo.name, reason: "aucun mot-cle du registre dans le ticket, et aucun voisin de dependance concerne" })),
  };
}

function normalize(text: string): string {
  return ` ${text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ")} `;
}
