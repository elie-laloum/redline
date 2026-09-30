import { defineWorkflow, type Workflow, type WorkflowResult } from "@elie-laloum/outpost";
import type { Plan } from "../../domain/plan.ts";
import type { Contradiction, Scope } from "../../domain/scope.ts";
import type { TicketSnapshot } from "../../domain/ticket.ts";
import type { RunContext } from "../run.ts";
import { type FigmaBrief, figmaTask } from "./figma.ts";
import { functionalInterview, type GrillOutcome, technicalInterview } from "./grills.ts";
import { memoryTask } from "./memory.ts";
import { planTask } from "./planning.ts";
import { type Decision, reviewInterview } from "./review.ts";
import { scopeTask } from "./scope.ts";
import { ticketTask } from "./ticket.ts";

export interface FramingOutcome {
  readonly decision: Decision;
  readonly note: string | null;
  readonly ticket: TicketSnapshot;
  readonly figma: FigmaBrief;
  readonly functional: GrillOutcome;
  readonly technical: GrillOutcome;
  readonly scope: Scope;
  readonly plan: Plan;
  readonly contradictions: readonly Contradiction[];
}

export interface Framing {
  readonly workflow: Workflow;
  outcome(result: WorkflowResult): FramingOutcome;
}

export function defineFraming(run: RunContext): Framing {
  const ticket = ticketTask(run);
  const figma = figmaTask(run, ticket);
  const broad = memoryTask(run, "memory-broad", [ticket], (context) => ({ text: `${context.value(ticket).title}\n${context.value(ticket).description}` }));
  const functional = functionalInterview(run, { ticket, figma, memory: broad });
  const scope = scopeTask(run, { ticket, functional });
  const targeted = memoryTask(run, "memory-targeted", [ticket, scope], (context) => ({
    text: `${context.value(ticket).title}\n${context.value(ticket).description}`,
    repos: context.value(scope).scope.impacted.map((entry) => entry.repo),
  }));
  const technical = technicalInterview(run, { ticket, functional, scope, memory: targeted });
  const plan = planTask(run, { ticket, functional, technical, scope, memory: targeted });
  const review = reviewInterview(run, { ticket, scope, plan });
  const workflow = defineWorkflow("redline.framing", [ticket, figma, broad, functional, scope, targeted, technical, plan, review]);

  return {
    workflow,
    outcome(result) {
      const functionalOutcome = result.value(functional).output;
      const technicalOutcome = result.value(technical).output;
      const scoped = result.value(scope);
      return {
        ...result.value(review).output,
        ticket: result.value(ticket),
        figma: result.value(figma),
        functional: functionalOutcome,
        technical: technicalOutcome,
        scope: scoped.scope,
        plan: result.value(plan).candidate,
        contradictions: [...functionalOutcome.contradictions, ...scoped.contradictions, ...technicalOutcome.contradictions],
      };
    },
  };
}
