import { PlanSchema } from "../domain/plan.ts";
import type { TicketSnapshot } from "../domain/ticket.ts";
import { feedback, ticket } from "./render.ts";
import { defineRole } from "./role.ts";

export interface PlannerInput {
  readonly ticket: TicketSnapshot;
  readonly functional: string;
  readonly technical: string;
  readonly scope: string;
  readonly repos: string;
  readonly types: readonly string[];
  readonly memory: string;
  readonly feedback: string | null;
}

export const planner = defineRole({
  name: "planner",
  tag: "plan",
  schema: PlanSchema,
  values: (input: PlannerInput) => ({
    TICKET: ticket(input.ticket, null),
    FUNCTIONAL: input.functional,
    TECHNICAL: input.technical,
    SCOPE: input.scope,
    REPOS: input.repos,
    TYPES: input.types.join(", "),
    MEMORY: input.memory,
    FEEDBACK: feedback(input.feedback),
  }),
});
