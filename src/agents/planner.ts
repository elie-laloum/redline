import { PlanSchema } from "../domain/plan.ts";
import type { TicketSnapshot } from "../domain/ticket.ts";
import type { Exchange } from "../workflow/interview.ts";
import { feedback, ticket, transcript } from "./render.ts";
import { defineRole } from "./role.ts";

const NO_EXCHANGE = "(aucune question : le grill a conclu sur le ticket seul)";

export interface PlannerInput {
  readonly ticket: TicketSnapshot;
  readonly notes: string | null;
  readonly functional: string;
  readonly functionalExchanges: readonly Exchange[];
  readonly technical: string;
  readonly technicalExchanges: readonly Exchange[];
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
    TICKET: ticket(input.ticket, input.notes),
    FUNCTIONAL: input.functional,
    FUNCTIONAL_EXCHANGES: transcript(input.functionalExchanges, NO_EXCHANGE),
    TECHNICAL: input.technical,
    TECHNICAL_EXCHANGES: transcript(input.technicalExchanges, NO_EXCHANGE),
    SCOPE: input.scope,
    REPOS: input.repos,
    TYPES: input.types.join(", "),
    MEMORY: input.memory,
    FEEDBACK: feedback(input.feedback),
  }),
});
