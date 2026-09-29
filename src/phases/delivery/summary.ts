import { defineTask, type Task } from "@elie-laloum/outpost";
import { git } from "../../adapters/git.ts";
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
}

export function summaryTask(target: RepoTarget, workspace: Task<Prepared>, after: readonly Task[], release: Task<Release> | null): Task<DeliveredRepo> {
  return defineTask({
    key: `${target.repo.name}.summary`,
    after: [workspace, ...after, ...(release ? [release] : [])],
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
      };
    },
  });
}
