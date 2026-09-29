import { parse as parseYaml } from "yaml";
import { fail } from "./failure.ts";

export const SCOPES = ["company", "domain", "capability", "feature", "integration", "repo", "decision", "incident", "change"] as const;
export type Scope = (typeof SCOPES)[number];

export const SCOPE_DIRECTORIES: Readonly<Record<Scope, string>> = {
  company: "company",
  domain: "domains",
  capability: "capabilities",
  feature: "features",
  integration: "integrations",
  repo: "repos",
  decision: "decisions",
  incident: "incidents",
  change: "changes",
};

export interface Frontmatter {
  readonly type: string;
  readonly scope: Scope;
  readonly feature?: string | null;
  readonly last_verified: string;
  readonly repos?: readonly string[];
  readonly source?: { readonly ticket?: string | null; readonly figma?: string | null };
  readonly [key: string]: unknown;
}

export interface Note {
  readonly path: string;
  readonly frontmatter: Frontmatter;
  readonly body: string;
  readonly lines: number;
}

export interface MemoryQuery {
  readonly scope?: Scope | readonly Scope[];
  readonly feature?: string;
  readonly repos?: readonly string[];
  readonly type?: string;
  readonly pathPrefix?: string;
  readonly grep?: string;
  readonly limit?: number;
}

const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/;

export function parseNote(path: string, raw: string): Note {
  const match = FRONTMATTER.exec(raw);
  if (!match?.[1]) fail(`Note sans frontmatter : ${path}.`, "Toute note porte au minimum type, scope et last_verified.");
  const frontmatter = parseYaml(match[1]) as Frontmatter;
  const problems = frontmatterProblems(path, frontmatter);
  if (problems.length > 0) fail(`Note invalide ${path} : ${problems.join(" ; ")}.`);
  const body = (match[2] ?? "").replace(/^\n+/, "").replace(/\n+$/, "");
  return { path, frontmatter, body, lines: countLines(body) };
}

export function frontmatterProblems(path: string, frontmatter: Frontmatter | null | undefined): string[] {
  if (!frontmatter || typeof frontmatter !== "object") return ["frontmatter illisible"];
  const problems: string[] = [];
  if (!frontmatter.type) problems.push("`type` manquant");
  if (!SCOPES.includes(frontmatter.scope)) problems.push(`scope inconnu : ${String(frontmatter.scope)}`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(frontmatter.last_verified ?? ""))) problems.push("`last_verified` manquant ou mal forme (AAAA-MM-JJ)");
  const expected = SCOPE_DIRECTORIES[frontmatter.scope];
  const top = path.split("/")[0];
  if (expected && top !== expected) problems.push(`scope ${frontmatter.scope} rangee sous ${top}/, attendu ${expected}/`);
  if (!path.endsWith(".md")) problems.push("une note est un fichier .md");
  if (path.split("/").includes("..") || path.startsWith("/")) problems.push("chemin hors de memory/");
  return problems;
}

export function lengthProblem(body: string, maxLines: number): string | null {
  const lines = countLines(body);
  return lines > maxLines ? `${lines} lignes hors frontmatter, la limite est ${maxLines} : scinder la note` : null;
}

export function queryNotes(notes: readonly Note[], query: MemoryQuery): Note[] {
  const scopes = query.scope ? new Set<Scope>(Array.isArray(query.scope) ? query.scope : [query.scope as Scope]) : null;
  const repos = query.repos?.map((repo) => repo.toLowerCase());
  const needle = query.grep ? new RegExp(query.grep, "i") : null;
  const matched = notes.filter((note) => {
    if (scopes && !scopes.has(note.frontmatter.scope)) return false;
    if (query.type && note.frontmatter.type !== query.type) return false;
    if (query.feature && String(note.frontmatter.feature ?? "") !== query.feature) return false;
    if (query.pathPrefix && !note.path.startsWith(query.pathPrefix)) return false;
    if (repos?.length && !repos.some((repo) => (note.frontmatter.repos ?? []).map((r) => String(r).toLowerCase()).includes(repo))) return false;
    if (needle && !needle.test(note.body) && !needle.test(note.path)) return false;
    return true;
  });
  return query.limit ? matched.slice(0, query.limit) : matched;
}

export function countLines(body: string): number {
  const trimmed = body.replace(/\s+$/, "");
  return trimmed === "" ? 0 : trimmed.split("\n").length;
}
