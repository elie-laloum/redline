import { copyFileSync, existsSync, mkdirSync, readdirSync, renameSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { git, gitAllowFailure } from "../adapters/git.ts";
import type { Settings } from "../domain/config.ts";
import { fail } from "../domain/failure.ts";
import { GITIGNORE_WITHOUT_MEMORY, REDLINE_IDENTITY } from "./home.ts";
import { expandTilde, type Paths } from "./paths.ts";

/** Where the memory's notes live, and whether they have a git repository of their own. */
export interface MemoryRepository {
  readonly directory: string;
  /** False while the memory lives in the home's repository, as before 4.0. */
  readonly separate: boolean;
  /** The URL redline clones the memory from, when it manages the clone. */
  readonly url: string | null;
}

export type Committer = { readonly name: string; readonly email: string } | undefined;

export function memoryRepository(settings: Settings, home: string): MemoryRepository {
  const { repository, path } = settings.memory;
  if (path) return { directory: resolve(expandTilde(path)), separate: true, url: null };
  return { directory: join(home, "memory"), separate: repository !== null, url: repository };
}

/** A memory cloned from a URL is cloned on the first run of a new machine; a path must exist. */
export async function ensureMemory(memory: MemoryRepository): Promise<void> {
  if (!memory.separate || existsSync(join(memory.directory, ".git"))) return;
  if (!memory.url) fail(`La memoire ${memory.directory} n'est pas un depot git.`, "Corrige memory.path avec : bun redline init");
  if (existsSync(memory.directory) && readdirSync(memory.directory).length > 0) {
    fail(`${memory.directory} existe deja et n'est pas un clone de ${memory.url}.`, "Raccorde la memoire avec : bun redline init, qui propose d'importer ces notes");
  }
  mkdirSync(dirname(memory.directory), { recursive: true });
  await git(dirname(memory.directory), ["clone", "-q", memory.url, memory.directory], 300_000);
}

/** Pulls the shared memory before it is read; a failure keeps the local notes and says why. */
export async function pullMemory(memory: MemoryRepository): Promise<string | null> {
  if (!memory.separate || !(await hasRemote(memory.directory))) return null;
  const pulled = await gitAllowFailure(memory.directory, ["pull", "--rebase", "--quiet"], 120_000);
  if (pulled.ok) return null;
  await gitAllowFailure(memory.directory, ["rebase", "--abort"]);
  return `pull de la memoire impossible, les notes locales servent telles quelles : ${firstLine(pulled.stderr)}`;
}

/**
 * Commits the notes under the human's identity, then pushes them. A push that fails, a conflict or
 * an unreachable remote, leaves the commit local and says why: the run never fails on it.
 */
export async function commitMemory(memory: MemoryRepository, message: string, committer: Committer): Promise<{ readonly commit: string | null; readonly warning: string | null }> {
  const directory = memory.directory;
  await git(directory, ["add", "-A", "--", "."]);
  if ((await gitAllowFailure(directory, ["diff", "--cached", "--quiet"])).ok) return { commit: null, warning: null };
  await git(directory, [...(await identityFor(directory, committer)), "commit", "-q", "-m", message]);
  const commit = await git(directory, ["rev-parse", "--short", "HEAD"]);
  if (!(await hasRemote(directory))) return { commit, warning: null };
  const pushed = await gitAllowFailure(directory, ["push", "--quiet"], 120_000);
  return { commit, warning: pushed.ok ? null : `push de la memoire refuse, le commit ${commit} reste local : ${firstLine(pushed.stderr)}` };
}

export interface MemoryConnection {
  readonly imported: readonly string[];
  /** Notes the repository already had under the same path: left as they were. */
  readonly skipped: readonly string[];
  /** Where the home's former notes were moved, if anywhere. */
  readonly archived: string | null;
  readonly commit: string | null;
  readonly warning: string | null;
}

/**
 * Moves the memory out of the home's repository into its own: a clone of `url` in the home, or the
 * existing clone at `path`. The home's notes are imported on request, without overwriting a note,
 * then archived; the home's repository stops tracking memory/.
 */
export async function connectMemory(paths: Paths, target: { readonly url: string } | { readonly path: string }, options: { readonly importNotes: boolean; readonly committer: Committer }): Promise<MemoryConnection> {
  const former = join(paths.home, "memory");
  const formerIsRepository = existsSync(join(former, ".git"));
  const notes = existsSync(former) && !formerIsRepository ? files(former) : [];
  let archived: string | null = null;
  const archive = () => {
    if (!existsSync(former) || formerIsRepository) return former;
    archived = `${former}.archive-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}`;
    renameSync(former, archived);
    return archived;
  };

  let memory: MemoryRepository;
  let source = former;
  if ("url" in target) {
    source = archive();
    memory = { directory: former, separate: true, url: target.url };
    await ensureMemory(memory);
  } else {
    memory = { directory: resolve(expandTilde(target.path)), separate: true, url: null };
    if (!existsSync(join(memory.directory, ".git"))) fail(`${memory.directory} n'est pas un clone git.`, "Donne le chemin d'un depot clone, ou son URL.");
  }

  const imported: string[] = [];
  const skipped: string[] = [];
  if (options.importNotes) {
    for (const file of notes) {
      const name = relative(former, file);
      const destination = join(memory.directory, name);
      if (existsSync(destination)) {
        skipped.push(name);
        continue;
      }
      mkdirSync(dirname(destination), { recursive: true });
      copyFileSync(join(source, name), destination);
      imported.push(name);
    }
  }
  const committed = imported.length > 0 ? await commitMemory(memory, "memory: import depuis le home redline", options.committer) : { commit: null, warning: null };
  if ("path" in target) archive();
  await detachFromHome(paths);
  return { imported, skipped, archived, commit: committed.commit, warning: committed.warning };
}

/** The home's repository keeps its tickets and forgets memory/, which has a repository of its own now. */
async function detachFromHome(paths: Paths): Promise<void> {
  if (!existsSync(join(paths.home, ".git"))) return;
  await gitAllowFailure(paths.home, ["rm", "-r", "-q", "--cached", "--ignore-unmatch", "--", "memory"]);
  writeFileSync(join(paths.home, ".gitignore"), GITIGNORE_WITHOUT_MEMORY, "utf8");
  await git(paths.home, ["add", "--", ".gitignore"]);
  if (!(await gitAllowFailure(paths.home, ["diff", "--cached", "--quiet"])).ok) {
    await git(paths.home, [...REDLINE_IDENTITY, "commit", "-q", "-m", "redline: memoire dans son propre depot"]);
  }
}

/** The human's identity, or git.committer; redline's own when git knows neither. */
async function identityFor(directory: string, committer: Committer): Promise<string[]> {
  if (committer) return ["-c", `user.name=${committer.name}`, "-c", `user.email=${committer.email}`];
  return (await gitAllowFailure(directory, ["config", "user.email"])).stdout ? [] : [...REDLINE_IDENTITY];
}

async function hasRemote(directory: string): Promise<boolean> {
  return (await gitAllowFailure(directory, ["remote"])).stdout !== "";
}

function firstLine(text: string): string {
  return text.split("\n").find((line) => line.trim())?.trim() ?? "sans message";
}

function files(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    if (entry === ".git") return [];
    const absolute = join(directory, entry);
    return statSync(absolute).isDirectory() ? files(absolute) : [absolute];
  });
}
