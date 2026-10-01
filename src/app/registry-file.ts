import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import * as v from "valibot";
import { Document, isSeq, parseDocument } from "yaml";
import { gitAllowFailure } from "../adapters/git.ts";
import { type Registry, RegistrySchema, type RepoEntry, registryProblems, TEST_KINDS } from "../domain/config.ts";
import { fail } from "../domain/failure.ts";
import { expandTilde, type Paths } from "./paths.ts";

export type RepoField = keyof RepoEntry;

/** A repository read from its checkout, and which of its fields are only a guess to confirm. */
export interface DetectedRepository {
  readonly entry: RepoEntry;
  readonly guessed: readonly RepoField[];
}

/**
 * What a checkout says of itself without guessing: its remote, its default branch, its lockfile,
 * its package. Commands are never inferred — a test you believe runs and never does is worse than
 * none — so they start null, with withoutTests until one is declared.
 */
export async function detectRepository(path: string): Promise<DetectedRepository> {
  const root = expandTilde(path);
  if (!existsSync(join(root, ".git"))) fail(`${root} n'est pas un checkout git.`);
  const guessed: RepoField[] = [];
  const name = basename(root);
  const remote = (await gitAllowFailure(root, ["remote", "get-url", "origin"])).stdout;
  const project = projectOf(remote);
  if (!project) guessed.push("gitlabProject");
  const head = (await gitAllowFailure(root, ["symbolic-ref", "--short", "refs/remotes/origin/HEAD"])).stdout.replace(/^origin\//, "");
  const current = (await gitAllowFailure(root, ["symbolic-ref", "--short", "HEAD"])).stdout;
  if (!head) guessed.push("baseBranch");
  const manifest = readManifest(root);
  const entry: RepoEntry = {
    name,
    level: 1,
    path,
    gitlabProject: project ?? `groupe/${name}`,
    baseBranch: head || current || "main",
    layer: "backend",
    packageManager: packageManagerOf(root),
    monorepoTool: existsSync(join(root, "turbo.json")) ? "turbo" : existsSync(join(root, "lerna.json")) ? "lerna" : null,
    packageName: manifest.name,
    dependsOn: [],
    commands: { lint: null, typecheck: null, ut: null, it: null, ft: null, ct: null, e2e: null },
    withoutTests: true,
    localFiles: [],
    reports: {},
    targeting: {},
    containers: { required: false, images: [] },
    bump: null,
    release: { manifest: "package.json", tagPrefix: "v" },
    ciJobsToWatch: [],
    description: manifest.description ?? `Depot ${name}.`,
    keywords: [],
  };
  if (!manifest.description) guessed.push("description");
  return { entry, guessed };
}

/** The lowest level a repository can have: strictly above everything it depends on. */
export function proposedLevel(registry: Registry, dependsOn: readonly string[]): number {
  const levels = registry.repositories.filter((repo) => dependsOn.includes(repo.name)).map((repo) => repo.level);
  return levels.length ? Math.max(...levels) + 1 : 1;
}

/** Appends a repository, with only the keys a human writes by hand. */
export function addRepository(paths: Paths, entry: RepoEntry): void {
  edit(paths, (document) => {
    if (!isSeq(document.get("repositories", true))) document.set("repositories", document.createNode([]));
    document.addIn(["repositories"], document.createNode(written(entry), { flow: false }));
  });
}

/**
 * Sets one field of a repository; every other line stays as written. withoutTests follows the
 * test commands: it is true exactly when none is declared.
 */
export function setRepositoryField(paths: Paths, name: string, field: readonly [RepoField, ...string[]], value: unknown): void {
  edit(paths, (document, registry) => {
    const index = indexOf(registry, name);
    document.setIn(["repositories", index, ...field], value);
    if (field[0] !== "commands") return;
    const commands = (document.getIn(["repositories", index, "commands"]) as { toJSON(): Record<string, string | null> } | undefined)?.toJSON() ?? {};
    const tested = TEST_KINDS.some((kind) => commands[kind] !== null && commands[kind] !== undefined);
    if (!tested) document.setIn(["repositories", index, "withoutTests"], true);
    else if (document.hasIn(["repositories", index, "withoutTests"])) document.deleteIn(["repositories", index, "withoutTests"]);
  });
}

export function removeRepository(paths: Paths, name: string): void {
  edit(paths, (document, registry) => document.deleteIn(["repositories", indexOf(registry, name)]));
}

function edit(paths: Paths, change: (document: Document, registry: Registry) => void): void {
  const document = existsSync(paths.registry) ? parseDocument(readFileSync(paths.registry, "utf8")) : new Document({ schemaVersion: 1, repositories: [] });
  const before = v.safeParse(RegistrySchema, document.toJS());
  change(document, before.success ? before.output : { schemaVersion: 1, repositories: [], evalOnly: { repos: [], jiraProjects: [] } });
  const result = v.safeParse(RegistrySchema, document.toJS());
  if (!result.success) fail(`Registre invalide :\n- ${result.issues.map((issue) => `${v.getDotPath(issue) ?? "(racine)"} : ${issue.message}`).join("\n- ")}`);
  const problems = registryProblems(result.output);
  if (problems.length > 0) fail(`Registre incoherent :\n- ${problems.join("\n- ")}`);
  mkdirSync(dirname(paths.registry), { recursive: true });
  const temporary = `${paths.registry}.${process.pid}.tmp`;
  writeFileSync(temporary, String(document), "utf8");
  renameSync(temporary, paths.registry);
}

function indexOf(registry: Registry, name: string): number {
  const index = registry.repositories.findIndex((repo) => repo.name === name);
  return index >= 0 ? index : fail(`Aucun depot ${name} dans le registre.`);
}

/** The keys the registry's example spells out; the others keep their defaults until edited by hand. */
function written(entry: RepoEntry): Record<string, unknown> {
  const { localFiles: _l, reports: _r, targeting: _t, containers: _c, bump: _b, release: _re, withoutTests, ...kept } = entry;
  return { ...kept, ...(withoutTests ? { withoutTests } : {}) };
}

/** group/project from an ssh or https remote. */
export function projectOf(remote: string): string | null {
  const match = /^(?:[a-z+]+:\/\/)?(?:[^@/]+@)?[^:/]+(?::\d+)?[:/](.+?)(?:\.git)?\/?$/.exec(remote.trim());
  const project = match?.[1] ?? null;
  return project?.includes("/") ? project : null;
}

function packageManagerOf(root: string): RepoEntry["packageManager"] {
  if (existsSync(join(root, "bun.lock")) || existsSync(join(root, "bun.lockb"))) return "bun";
  if (existsSync(join(root, "pnpm-lock.yaml"))) return "pnpm";
  if (existsSync(join(root, "yarn.lock"))) return "yarn";
  return "npm";
}

function readManifest(root: string): { readonly name: string | null; readonly description: string | null } {
  try {
    const manifest = JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as { name?: unknown; description?: unknown };
    return { name: typeof manifest.name === "string" ? manifest.name : null, description: typeof manifest.description === "string" && manifest.description.trim() ? manifest.description.trim() : null };
  } catch {
    return { name: null, description: null };
  }
}
