import * as v from "valibot";
import type { PlanCode } from "../domain/plan.ts";
import type { TicketSnapshot } from "../domain/ticket.ts";
import { bullets, ticket } from "./render.ts";
import { defineRole } from "./role.ts";
import { everyOnce, type LineVerdict, LineVerdictSchema } from "./shared.ts";

export interface CodeAdversaryInput {
  readonly ticket: TicketSnapshot;
  readonly repo: string;
  readonly code: readonly PlanCode[];
  readonly arbitrages: string;
  readonly base: string;
}

export const codeAdversary = defineRole({
  name: "code-adversary",
  tag: "verdict",
  schema: (input: CodeAdversaryInput) =>
    v.object({
      lines: v.pipe(v.array(LineVerdictSchema), everyOnce<LineVerdict>(input.code.map((line) => line.id), (line) => line.id)),
      remarks: v.array(v.string()),
    }),
  values: (input: CodeAdversaryInput) => ({
    TICKET: ticket(input.ticket, null),
    REPO: input.repo,
    CODE: bullets(input.code.map((line) => `${line.id} ${line.criterion}`)),
    ARBITRAGES: input.arbitrages,
    BASE: input.base,
  }),
});
