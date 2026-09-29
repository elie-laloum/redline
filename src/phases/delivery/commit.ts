import { existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { committerArgs, git, gitAllowFailure, workingChanges } from "../../adapters/git.ts";
import { buildCommitMessage, type CommitIntent } from "../../domain/commit-message.ts";
import { type Zone, zoneViolations } from "../../domain/zones.ts";

export interface Committed {
  readonly sha: string | null;
  readonly subject: string | null;
  readonly files: readonly string[];
  readonly reverted: readonly string[];
}

export interface CommitRequest {
  readonly directory: string;
  readonly zone: Zone;
  readonly baseline: string;
  readonly intent: CommitIntent | null;
  readonly fallback: CommitIntent;
  readonly ticket: string;
  readonly committer?: { readonly name: string; readonly email: string };
}

export async function commitWork(request: CommitRequest): Promise<Committed> {
  const { directory, baseline } = request;
  if ((await git(directory, ["rev-parse", "HEAD"])) !== baseline) await git(directory, ["reset", "--soft", "-q", baseline]);
  await git(directory, ["reset", "-q"]);
  const changed = await workingChanges(directory);
  const reverted = zoneViolations(request.zone, changed);
  for (const path of reverted) await revert(directory, baseline, path);
  const files = changed.filter((path) => !reverted.includes(path));
  if (files.length === 0) return { sha: null, subject: null, files, reverted };
  await git(directory, ["add", "-A", "--", ...files]);
  const message = buildCommitMessage(request.intent ?? request.fallback, request.ticket);
  await git(directory, [...committerArgs(request.committer), "commit", "-q", "--no-verify", "-m", message]);
  return { sha: await git(directory, ["rev-parse", "HEAD"]), subject: message.split("\n")[0] ?? null, files, reverted };
}

async function revert(directory: string, baseline: string, path: string): Promise<void> {
  const tracked = await gitAllowFailure(directory, ["cat-file", "-e", `${baseline}:${path}`]);
  if (tracked.ok) await git(directory, ["checkout", "-q", baseline, "--", path]);
  else if (existsSync(join(directory, path))) rmSync(join(directory, path), { recursive: true, force: true });
}
