import * as v from "valibot";
import type { PlanTest } from "../domain/plan.ts";
import type { TicketSnapshot } from "../domain/ticket.ts";
import { bullets, ticket } from "./render.ts";
import { defineRole } from "./role.ts";
import { everyOnce, type LineVerdict, LineVerdictSchema, text } from "./shared.ts";

export interface TestAdversaryInput {
  readonly ticket: TicketSnapshot;
  readonly notes: string | null;
  readonly repo: string;
  readonly tests: readonly PlanTest[];
  readonly files: readonly string[];
  readonly kinds: readonly string[];
}

export const testAdversary = defineRole({
  name: "test-adversary",
  tag: "verdict",
  schema: (input: TestAdversaryInput) =>
    v.object({
      lines: v.pipe(v.array(LineVerdictSchema), everyOnce<LineVerdict>(input.tests.map((test) => test.id), (line) => line.id)),
      weaknesses: v.array(v.object({ file: text, problem: text })),
    }),
  values: (input: TestAdversaryInput) => ({
    TICKET: ticket(input.ticket, input.notes),
    REPO: input.repo,
    TESTS: bullets(input.tests.map((test) => `${test.id} [${test.kind}] ${test.criterion}`)),
    FILES: bullets(input.files),
    KINDS: input.kinds.join(", ") || "aucun",
  }),
});
