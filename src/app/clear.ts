import { existsSync, rmSync } from "node:fs";
import { gitAllowFailure, workingChanges } from "../adapters/git.ts";
import { fail } from "../domain/failure.ts";
import type { Publication } from "../phases/closing/workflow.ts";
import type { AppContext } from "./context.ts";
import { readLedger } from "./ledger.ts";
import { isAlive, readLock } from "./lock.ts";
import { expandTilde, figmaDirectory, lockFile, logDirectory, runDirectory, ticketFile } from "./paths.ts";

export interface ClearReport {
  readonly removed: readonly string[];
  readonly blocked: readonly string[];
  readonly remote: readonly string[];
}

interface Worktree {
  readonly repo: string;
  readonly root: string;
  readonly path: string;
  readonly branch: string;
}

export async function clearTicket(app: AppContext, key: string, options: { force: boolean; dryRun: boolean }): Promise<ClearReport> {
  const holder = readLock(app.paths, key);
  if (holder && holder.pid !== process.pid && isAlive(holder.pid)) fail(`${key} tourne encore (pid ${holder.pid}) : arrete-le avant de nettoyer.`);
  const publication = readLedger(app.paths, key)?.publication as Publication | null | undefined;
  const removed: string[] = [];
  const blocked: string[] = [];
  const remote: string[] = [];

  for (const worktree of await worktreesOf(app, key)) {
    const risk = await riskOf(worktree);
    if (risk && !options.force) {
      blocked.push(`${worktree.path} : ${risk} (--force pour supprimer quand meme)`);
      continue;
    }
    removed.push(`${worktree.path} (${worktree.branch})`);
    if (options.dryRun) continue;
    await gitAllowFailure(worktree.root, ["worktree", "remove", "--force", worktree.path]);
    await gitAllowFailure(worktree.root, ["branch", "-D", worktree.branch]);
    await gitAllowFailure(worktree.root, ["worktree", "prune"]);
  }

  for (const path of [runDirectory(app.paths, key), ticketFile(app.paths, key), lockFile(app.paths, key), figmaDirectory(app.paths, key), logDirectory(app.paths, key)]) {
    if (!existsSync(path)) continue;
    removed.push(path);
    if (!options.dryRun) rmSync(path, { recursive: true, force: true });
  }

  for (const request of publication?.mergeRequests ?? []) remote.push(`MR ${request.repo} : ${request.url}`);
  if (publication?.slack) remote.push(`canal Slack #${publication.slack.channel.name}`);
  if (publication?.jira.transition) remote.push(`transition Jira vers ${publication.jira.transition}`);
  for (const repo of app.configuration.registry.repositories) {
    const tags = await gitAllowFailure(expandTilde(repo.path), ["tag", "--list", `*-${key}-*`]);
    for (const tag of tags.stdout.split("\n").filter(Boolean)) remote.push(`tag ${tag} (${repo.name})`);
  }
  return { removed, blocked, remote };
}

async function worktreesOf(app: AppContext, key: string): Promise<Worktree[]> {
  const found: Worktree[] = [];
  for (const repo of app.configuration.registry.repositories) {
    const root = expandTilde(repo.path);
    if (!existsSync(root)) continue;
    const listing = await gitAllowFailure(root, ["worktree", "list", "--porcelain"]);
    for (const block of listing.stdout.split("\n\n")) {
      const path = /^worktree (.+)$/m.exec(block)?.[1];
      const branch = /^branch refs\/heads\/(.+)$/m.exec(block)?.[1];
      if (path && branch && path !== root && branch.includes(`${key}-`)) found.push({ repo: repo.name, root, path, branch });
    }
  }
  return found;
}

async function riskOf(worktree: Worktree): Promise<string | null> {
  if (!existsSync(worktree.path)) return null;
  if ((await workingChanges(worktree.path)).length > 0) return "modifications non commitees";
  const upstream = await gitAllowFailure(worktree.path, ["rev-list", "--count", "@{u}..HEAD"]);
  if (upstream.ok) return Number(upstream.stdout) > 0 ? "commits non pousses" : null;
  return "branche jamais poussee";
}
