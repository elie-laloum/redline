import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { git, gitAllowFailure } from "../adapters/git.ts";
import { createMemoryStore } from "../adapters/memory-store.ts";
import type { Paths } from "./paths.ts";

export const REDLINE_IDENTITY = ["-c", "user.name=redline", "-c", "user.email=redline@localhost"] as const;

const GITIGNORE = ["*", "!.gitignore", "!CLAUDE.md", "!memory/", "!memory/**", "!tickets/", "!tickets/**", ""].join("\n");
/** Once the memory has a repository of its own, the home's only tracks the tickets. */
export const GITIGNORE_WITHOUT_MEMORY = ["*", "!.gitignore", "!CLAUDE.md", "!tickets/", "!tickets/**", ""].join("\n");

const READER_GUIDE = [
  "# Espace de lecture redline",
  "",
  "- `memory/` : la memoire versionnee, une note par fichier, frontmatter compris.",
  "- `/repos/<nom>` : les depots du registre, montes en lecture seule. Ils sont la source de verite du code.",
  "- Tu ne modifies rien ici : tu lis, tu cites `fichier:ligne`, tu rends ta reponse.",
  "",
].join("\n");

/** `layoutMemory` false leaves paths.memory alone: a memory cloned from a URL is not there yet. */
export async function ensureHome(paths: Paths, options: { readonly layoutMemory?: boolean } = {}): Promise<void> {
  for (const directory of [paths.home, paths.tickets, paths.runs, paths.logs, paths.figma, paths.locks, paths.tmp]) mkdirSync(directory, { recursive: true });
  if (options.layoutMemory !== false) createMemoryStore(paths.memory, Number.MAX_SAFE_INTEGER).ensureLayout();
  if (!existsSync(join(paths.home, ".gitignore"))) writeFileSync(join(paths.home, ".gitignore"), GITIGNORE, "utf8");
  if (!existsSync(join(paths.home, "CLAUDE.md"))) writeFileSync(join(paths.home, "CLAUDE.md"), READER_GUIDE, "utf8");
  if (!existsSync(join(paths.home, ".git"))) await git(paths.home, ["init", "-q", "-b", "main"]);
  if (!(await gitAllowFailure(paths.home, ["rev-parse", "--verify", "HEAD"])).ok) {
    await git(paths.home, ["add", "--", ".gitignore", "CLAUDE.md"]);
    await git(paths.home, [...REDLINE_IDENTITY, "commit", "-q", "-m", "redline: home"]);
  }
}

// outpost bind-mounts folders made with mkdtemp(tmpdir()). On macOS tmpdir() is /var/folders,
// which colima does not share with its VM: keep them under the home, which it does share.
export function redirectTmpdir(paths: Paths): void {
  mkdirSync(paths.tmp, { recursive: true });
  process.env.TMPDIR = paths.tmp;
}

/** Commits the tickets, and the memory while it lives in the home's repository. */
export async function commitHome(paths: Paths, message: string, scope: readonly string[] = ["memory", "tickets"]): Promise<string | null> {
  await git(paths.home, ["add", "-A", "--", ...scope]);
  if ((await gitAllowFailure(paths.home, ["diff", "--cached", "--quiet"])).ok) return null;
  await git(paths.home, [...REDLINE_IDENTITY, "commit", "-q", "-m", message]);
  return git(paths.home, ["rev-parse", "--short", "HEAD"]);
}
