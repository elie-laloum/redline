import * as v from "valibot";
import type { PlanRepo } from "../domain/plan.ts";
import type { TicketSnapshot } from "../domain/ticket.ts";
import { bullets, feedback, ticket } from "./render.ts";
import { defineRole } from "./role.ts";
import { CommitIntentSchema, text } from "./shared.ts";

export interface TestWriterInput {
  readonly ticket: TicketSnapshot;
  readonly notes: string | null;
  readonly entry: PlanRepo;
  readonly arbitrages: string;
  readonly kinds: readonly string[];
  readonly feedback: string | null;
}

export const testWriter = defineRole({
  name: "test-writer",
  tag: "tests",
  schema: (input: TestWriterInput) =>
    v.pipe(
      v.object({
        files: v.array(v.object({ path: text, tests: v.array(text) })),
        commit: CommitIntentSchema,
        uncoverable: v.array(v.object({ id: text, reason: text })),
      }),
      v.check((reply) => {
        const mapped = new Set([...reply.files.flatMap((file) => file.tests), ...reply.uncoverable.map((entry) => entry.id)]);
        return input.entry.tests.every((test) => mapped.has(test.id));
      }, "chaque ligne de la checklist tests est rattachee a un fichier, ou declaree non couvrable"),
    ),
  values: (input: TestWriterInput) => ({
    TICKET: ticket(input.ticket, input.notes),
    REPO: input.entry.repo,
    CHANGES: bullets(input.entry.changes),
    TESTS: bullets(input.entry.tests.map((test) => `${test.id} [${test.kind}] ${test.criterion} (couvre ${test.covers.join(", ")})`)),
    ARBITRAGES: input.arbitrages,
    KINDS: input.kinds.join(", ") || "aucun",
    FEEDBACK: feedback(input.feedback),
  }),
});
