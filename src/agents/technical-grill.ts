import type * as v from "valibot";
import type { TicketSnapshot } from "../domain/ticket.ts";
import type { Exchange } from "../workflow/interview.ts";
import { feedback, functionalFraming, ticket, transcript } from "./render.ts";
import { defineRole } from "./role.ts";
import { type ArbitrageSchema, type Divergence, technicalGrillSchema } from "./shared.ts";

export interface TechnicalGrillInput {
  readonly ticket: TicketSnapshot;
  readonly notes: string | null;
  readonly functional: readonly v.InferOutput<typeof ArbitrageSchema>[];
  readonly divergences: readonly Divergence[];
  /** The functional arbitrages whose derogation the human refused. */
  readonly refused: readonly string[];
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
  schema: (input: TechnicalGrillInput) => technicalGrillSchema(input.functional.length, input.refused),
  values: (input: TechnicalGrillInput) => ({
    TICKET: ticket(input.ticket, input.notes),
    FUNCTIONAL: functionalFraming({ arbitrages: input.functional, divergences: input.divergences }),
    SCOPE: input.scope,
    CONVENTIONS: input.conventions,
    MEMORY: input.memory,
    TRANSCRIPT: transcript(input.transcript),
    TURN: input.turn,
    MAX_TURNS: input.maxTurns,
    REOPEN: feedback(input.reopen),
  }),
});
