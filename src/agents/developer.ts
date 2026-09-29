import * as v from "valibot";
import type { PlanCode, PlanRepo } from "../domain/plan.ts";
import type { TicketSnapshot } from "../domain/ticket.ts";
import { bullets, feedback, ticket } from "./render.ts";
import { defineRole } from "./role.ts";
import { CommitIntentSchema, ContradictionSchema, text } from "./shared.ts";

export interface DeveloperInput {
  readonly ticket: TicketSnapshot;
  readonly entry: PlanRepo;
  readonly batch: readonly PlanCode[];
  readonly arbitrages: string;
  readonly checks: string;
  readonly feedback: string | null;
}

export const developer = defineRole({
  name: "developer",
  tag: "livraison",
  schema: v.object({
    commit: v.nullable(CommitIntentSchema),
    appeals: v.array(v.object({ kind: v.picklist(["zone-non-couverte", "test-conteste"]), test: v.nullable(v.string()), reason: text })),
    contradictions: v.array(ContradictionSchema),
  }),
  values: (input: DeveloperInput) => ({
    TICKET: ticket(input.ticket, null),
    REPO: input.entry.repo,
    CHANGES: bullets(input.entry.changes),
    TESTS: bullets(input.entry.tests.map((test) => `${test.id} ${test.criterion}`)),
    BATCH: bullets(input.batch.map((line) => `${line.id} ${line.criterion}`)),
    ARBITRAGES: input.arbitrages,
    CHECKS: input.checks,
    FEEDBACK: feedback(input.feedback),
  }),
});
