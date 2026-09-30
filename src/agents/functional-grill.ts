import type { TicketSnapshot } from "../domain/ticket.ts";
import type { Exchange } from "../workflow/interview.ts";
import { feedback, ticket, transcript } from "./render.ts";
import { defineRole } from "./role.ts";
import { grillSchema } from "./shared.ts";

export interface FunctionalGrillInput {
  readonly ticket: TicketSnapshot;
  readonly notes: string | null;
  readonly figma: string;
  readonly memory: string;
  readonly transcript: readonly Exchange[];
  readonly turn: number;
  readonly maxTurns: number;
  readonly reopen: string | null;
}

export const functionalGrill = defineRole({
  name: "functional-grill",
  tag: "grill",
  schema: grillSchema(),
  values: (input: FunctionalGrillInput) => ({
    TICKET: ticket(input.ticket, input.notes),
    FIGMA: input.figma,
    MEMORY: input.memory,
    TRANSCRIPT: transcript(input.transcript),
    TURN: input.turn,
    MAX_TURNS: input.maxTurns,
    REOPEN: feedback(input.reopen),
  }),
});
