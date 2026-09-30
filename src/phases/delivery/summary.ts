import { defineTask, type Task } from "@elie-laloum/outpost";
import { git } from "../../adapters/git.ts";
import type { Contradiction } from "../../domain/scope.ts";
import type { Converged } from "../../workflow/converge.ts";
import type { CodeCandidate } from "./code.ts";
import type { RepoTarget } from "./context.ts";
import type { Prepared } from "./workspace.ts";

export interface Release {
  readonly tag: string;
  readonly version: string;
}

export interface DeliveredRepo {
  readonly repo: string;
  readonly branch: string;
  readonly directory: string;
  readonly base: string;
  readonly baseBranch: string;
  readonly project: string;
  readonly commits: readonly string[];
  readonly release: Release | null;
  readonly contradictions: readonly Contradiction[];
}

export function summaryTask(target: RepoTarget, workspace: Task<Prepared>, code: Task<Converged<CodeCandidate>>, release: Task<Release> | null): Task<DeliveredRepo> {
  return defineTask({
    key: `${target.repo.name}.summary`,
    after: [workspace, code, ...(release ? [release] : [])],
    async perform(context) {
      const prepared = context.value(workspace);
      const log = await git(prepared.directory, ["log", "--format=%s", `${prepared.base}..HEAD`]);
      return {
        repo: target.repo.name,
        branch: prepared.branch,
        directory: prepared.directory,
        base: prepared.base,
        baseBranch: target.repo.baseBranch,
        project: target.repo.gitlabProject,
        commits: log.split("\n").filter(Boolean).reverse(),
        release: release ? context.value(release) : null,
        contradictions: context.value(code).candidate.contradictions,
      };
    },
  });
}
