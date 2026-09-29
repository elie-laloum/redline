import { arbitrages } from "../../agents/render.ts";
import { expandTilde } from "../../app/paths.ts";
import { findRepo, type RepoEntry } from "../../domain/config.ts";
import { fail } from "../../domain/failure.ts";
import { branchName } from "../../domain/naming.ts";
import type { PlanRepo } from "../../domain/plan.ts";
import type { RepoWorkspace } from "../../ports/sandboxes.ts";
import type { FramingOutcome } from "../framing/workflow.ts";
import type { RunContext } from "../run.ts";

export interface DeliveryContext extends RunContext {
  readonly framing: FramingOutcome;
}

export interface RepoTarget {
  readonly entry: PlanRepo;
  readonly repo: RepoEntry;
  readonly path: string;
  readonly branch: string;
}

export function targetsOf(run: DeliveryContext): RepoTarget[] {
  const { registry, settings } = run.app.configuration;
  return run.framing.plan.repos.map((entry) => {
    const repo = findRepo(registry, entry.repo) ?? fail(`Le plan vise ${entry.repo}, absent du registre.`);
    return { entry, repo, path: expandTilde(repo.path), branch: branchName(settings.naming, { type: entry.type, ticket: run.ledger.key, title: run.ledger.title }) };
  });
}

export function openTarget(run: DeliveryContext, target: RepoTarget): Promise<RepoWorkspace> {
  return run.app.services.sandboxes.openRepo({
    repo: target.repo,
    path: target.path,
    branch: target.branch,
    from: `origin/${target.repo.baseBranch}`,
    ...(run.signal ? { signal: run.signal } : {}),
  });
}

export async function withTarget<T>(run: DeliveryContext, target: RepoTarget, work: (workspace: RepoWorkspace) => Promise<T>): Promise<T> {
  const workspace = await openTarget(run, target);
  try {
    return await work(workspace);
  } finally {
    await workspace.close();
  }
}

export function arbitragesOf(run: DeliveryContext): string {
  return arbitrages([...run.framing.functional.arbitrages, ...run.framing.technical.arbitrages]);
}

export function seedOf(run: DeliveryContext, key: string): string | null {
  return run.ledger.delivery.seeds[key] ?? null;
}
