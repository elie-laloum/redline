import { defineWorkflow, type Workflow, type WorkflowResult } from "@elie-laloum/outpost/workflows";
import type { ClosingContext } from "./context.ts";
import type { ConformityReport } from "../../domain/conformity.ts";
import type { ReviewedPoint } from "../../domain/open-points.ts";
import { conformityTask } from "./conformity.ts";
import { type MemoryApplied, memoryApplyTask, memoryPlanTask } from "./memory.ts";
import { openPointsTask } from "./open-points.ts";
import { proseTask } from "./prose.ts";
import { type JiraPublication, jiraTask, mergeRequestsTask, type OpenedMergeRequest, pushTask, type SlackPublication, slackTask, transitionInterview } from "./publish.ts";

export interface Publication {
  readonly memory: MemoryApplied;
  readonly mergeRequests: readonly OpenedMergeRequest[];
  /** Null when Slack is switched off. */
  readonly slack: SlackPublication | null;
  readonly jira: JiraPublication;
  /** The plan's open points, and the divergences awaiting the product owner, as the human reviewed them. */
  readonly openPoints: readonly ReviewedPoint[];
  /** Per delivered repository, where the code departs from the functional decisions or the checklist. */
  readonly conformity: readonly ConformityReport[];
}

export interface Closing {
  readonly workflow: Workflow;
  outcome(result: WorkflowResult): Publication;
}

export function defineClosing(run: ClosingContext): Closing {
  const points = openPointsTask(run);
  const conformity = conformityTask(run);
  const plan = memoryPlanTask(run);
  const applied = memoryApplyTask(run, plan);
  const prose = proseTask(run, points, [applied]);
  const push = pushTask(run, [prose]);
  const requests = mergeRequestsTask(run, prose, push, points, conformity);
  const slack = slackTask(run, prose, requests);
  const decision = transitionInterview(run, requests, points);
  const jira = jiraTask(run, prose, decision, [slack]);
  return {
    workflow: defineWorkflow("redline.closing", [points, conformity, plan, applied, prose, push, requests, slack, decision, jira]),
    outcome: (result) => ({
      memory: result.value(applied),
      mergeRequests: result.value(requests),
      slack: result.value(slack),
      jira: result.value(jira),
      openPoints: result.value(points).output,
      conformity: result.value(conformity),
    }),
  };
}
