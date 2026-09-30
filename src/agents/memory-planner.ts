import * as v from "valibot";
import { ContradictionDecisionSchema, MemoryOpSchema } from "../domain/memory-ops.ts";
import type { TicketSnapshot } from "../domain/ticket.ts";
import { feedback, ticket } from "./render.ts";
import { defineRole } from "./role.ts";

export interface MemoryPlannerInput {
  readonly ticket: TicketSnapshot;
  readonly notes: string | null;
  readonly arbitrages: string;
  readonly plan: string;
  readonly delivered: string;
  readonly contradictions: string;
  readonly index: string;
  readonly today: string;
  readonly maxNoteLines: number;
  readonly feedback: string | null;
}

export const memoryPlanner = defineRole({
  name: "memory-planner",
  tag: "memoire",
  schema: v.object({ operations: v.array(MemoryOpSchema), decisions: v.array(ContradictionDecisionSchema) }),
  values: (input: MemoryPlannerInput) => ({
    TICKET: ticket(input.ticket, input.notes),
    ARBITRAGES: input.arbitrages,
    PLAN: input.plan,
    DELIVERED: input.delivered,
    CONTRADICTIONS: input.contradictions,
    INDEX: input.index,
    TODAY: input.today,
    MAX_LINES: input.maxNoteLines,
    FEEDBACK: feedback(input.feedback),
  }),
});
