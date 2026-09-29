import { defineWorkflow, type Task, type Workflow, type WorkflowResult } from "@elie-laloum/outpost";
import { downstreamInScope } from "../../domain/config.ts";
import { batchTasks, codeTask } from "./code.ts";
import { type DeliveryContext, targetsOf } from "./context.ts";
import { releaseTask } from "./release.ts";
import { type DeliveredRepo, type Release, summaryTask } from "./summary.ts";
import { testsTask } from "./tests.ts";
import { type Upstream, workspaceTask } from "./workspace.ts";

export interface Delivery {
  readonly workflow: Workflow;
  outcome(result: WorkflowResult): DeliveredRepo[];
}

export function defineDelivery(run: DeliveryContext): Delivery {
  const { registry } = run.app.configuration;
  const targets = targetsOf(run);
  const scope = targets.map((target) => target.repo.name);
  const releases = new Map<string, Task<Release>>();
  const tasks: Task[] = [];
  const summaries: Task<DeliveredRepo>[] = [];
  let previous: Task | null = null;

  for (const target of targets) {
    const upstream: Upstream[] = target.repo.dependsOn.flatMap((name) => {
      const release = releases.get(name);
      const upstreamRepo = targets.find((candidate) => candidate.repo.name === name)?.repo;
      return release && upstreamRepo?.packageName ? [{ package: upstreamRepo.packageName, release }] : [];
    });
    const workspace = workspaceTask(run, target, previous ? [previous] : [], upstream);
    const tests = testsTask(run, target, workspace);
    const lots = batchTasks(run, target, tests);
    const code = codeTask(run, target, tests, lots);
    const publishes = target.repo.packageName !== null && downstreamInScope(registry, target.repo.name, scope).length > 0;
    const release = publishes ? releaseTask(run, target, [code]) : null;
    if (release) releases.set(target.repo.name, release);
    const summary = summaryTask(target, workspace, code, release);
    tasks.push(workspace, tests, ...lots, code, ...(release ? [release] : []), summary);
    summaries.push(summary);
    previous = summary;
  }

  return {
    workflow: defineWorkflow("redline.delivery", tasks),
    outcome: (result) => summaries.map((summary) => result.value(summary)),
  };
}
