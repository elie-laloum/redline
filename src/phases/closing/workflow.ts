import { defineWorkflow, type Workflow, type WorkflowResult } from "@elie-laloum/outpost";
import type { ClosingContext } from "./context.ts";
import { type MemoryApplied, memoryApplyTask, memoryPlanTask } from "./memory.ts";
import { proseTask } from "./prose.ts";
import { type JiraPublication, jiraTask, mergeRequestsTask, type OpenedMergeRequest, pushTask, type SlackPublication, slackTask } from "./publish.ts";

export interface Publication {
  readonly memory: MemoryApplied;
  readonly mergeRequests: readonly OpenedMergeRequest[];
  /** Null when Slack is switched off. */
  readonly slack: SlackPublication | null;
  readonly jira: JiraPublication;
}

export interface Closing {
  readonly workflow: Workflow;
  outcome(result: WorkflowResult): Publication;
}

export function defineClosing(run: ClosingContext): Closing {
  const plan = memoryPlanTask(run);
  const applied = memoryApplyTask(run, plan);
  const prose = proseTask(run, [applied]);
  const push = pushTask(run, [prose]);
  const requests = mergeRequestsTask(run, prose, push);
  const slack = slackTask(run, prose, requests);
  const jira = jiraTask(run, prose, [slack]);
  return {
    workflow: defineWorkflow("redline.closing", [plan, applied, prose, push, requests, slack, jira]),
    outcome: (result) => ({ memory: result.value(applied), mergeRequests: result.value(requests), slack: result.value(slack), jira: result.value(jira) }),
  };
}
