import { defineWorkflow, type Task, type Workflow, type WorkflowResult } from "@elie-laloum/outpost";
import { type DeliveryContext, targetsOf } from "./context.ts";
import { type DeliveredRepo, summaryTask } from "./summary.ts";
import { testsTask } from "./tests.ts";
import { workspaceTask } from "./workspace.ts";

export interface Delivery {
  readonly workflow: Workflow;
  outcome(result: WorkflowResult): DeliveredRepo[];
}

export function defineDelivery(run: DeliveryContext): Delivery {
  const tasks: Task[] = [];
  const summaries: Task<DeliveredRepo>[] = [];
  let previous: Task | null = null;
  for (const target of targetsOf(run)) {
    const workspace = workspaceTask(run, target, previous ? [previous] : [], async () => []);
    const tests = testsTask(run, target, workspace);
    const summary = summaryTask(target, workspace, [tests], null);
    tasks.push(workspace, tests, summary);
    summaries.push(summary);
    previous = summary;
  }
  return {
    workflow: defineWorkflow("redline.delivery", tasks),
    outcome: (result) => summaries.map((summary) => result.value(summary)),
  };
}
