import type { TicketSnapshot } from "../domain/ticket.ts";
import type { Exchange } from "../workflow/interview.ts";
import { feedback, ticket, transcript } from "./render.ts";
import { defineRole } from "./role.ts";
import { grillSchema } from "./shared.ts";

export interface TechnicalGrillInput {
  readonly ticket: TicketSnapshot;
  readonly notes: string | null;
  readonly functional: string;
  readonly scope: string;
  readonly conventions: string;
  readonly memory: string;
  readonly transcript: readonly Exchange[];
  readonly turn: number;
  readonly maxTurns: number;
  readonly reopen: string | null;
}

export const technicalGrill = defineRole({
  name: "technical-grill",
  tag: "grill",
  schema: grillSchema(),
  values: (input: TechnicalGrillInput) => ({
    TICKET: ticket(input.ticket, input.notes),
    FUNCTIONAL: input.functional,
    SCOPE: input.scope,
    CONVENTIONS: input.conventions,
    MEMORY: input.memory,
    TRANSCRIPT: transcript(input.transcript),
    TURN: input.turn,
    MAX_TURNS: input.maxTurns,
    REOPEN: feedback(input.reopen),
  }),
});
