import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { Workspace } from "./model.ts";

const run = promisify(execFile);

export interface RepoChanges {
  readonly repo: string;
  readonly directory: string;
  readonly branch: string;
  /** Subjects of the commits the run has made, oldest first. */
  readonly commits: readonly string[];
  /** `git diff --stat` against the base, one line per file plus its summary. */
  readonly stat: readonly string[];
  readonly error: string | null;
}

async function git(directory: string, args: string[]): Promise<string> {
  const { stdout } = await run("git", args, { cwd: directory, encoding: "utf8", maxBuffer: 8 * 1024 * 1024 });
  return stdout.trimEnd();
}

const lines = (output: string): string[] => (output ? output.split("\n") : []);

/**
 * Reads what the run has written in a worktree so far. Returns an entry per workspace, in the
 * order they were opened, each carrying its own error rather than failing the whole read: a
 * worktree the run has just removed must not blank the panel for the others.
 */
export async function collectChanges(workspaces: readonly Workspace[]): Promise<RepoChanges[]> {
  return Promise.all(
    workspaces.map(async (workspace): Promise<RepoChanges> => {
      const common = { repo: workspace.repo, directory: workspace.directory, branch: workspace.branch };
      try {
        const base = await git(workspace.directory, ["merge-base", "HEAD", workspace.base]);
        const [log, stat] = await Promise.all([
          git(workspace.directory, ["log", "--format=%h %s", "--reverse", `${base}..HEAD`]),
          git(workspace.directory, ["diff", "--stat", `${base}..HEAD`]),
        ]);
        return { ...common, commits: lines(log), stat: lines(stat), error: null };
      } catch (error) {
        return { ...common, commits: [], stat: [], error: error instanceof Error ? error.message.split("\n")[0] ?? "lecture impossible" : "lecture impossible" };
      }
    }),
  );
}
