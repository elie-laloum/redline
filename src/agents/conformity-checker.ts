import * as v from "valibot";
import { CONFORMITY_VERDICTS } from "../domain/conformity.ts";
import type { TicketSnapshot } from "../domain/ticket.ts";
import { bullets, ticket } from "./render.ts";
import { defineRole } from "./role.ts";
import { everyOnce, text } from "./shared.ts";

export interface ConformityCheckerInput {
  readonly ticket: TicketSnapshot;
  readonly notes: string | null;
  readonly repo: string;
  /** One decision per functional arbitrage, `F1`…, the accepted derogation in place of the arbitrage it departs from. */
  readonly decisions: readonly { readonly id: string; readonly text: string }[];
  /** The repository's checklist lines, `T1`… and `C1`…. */
  readonly checklist: readonly { readonly id: string; readonly text: string }[];
  readonly base: string;
}

const CheckSchema = v.object({ id: text, verdict: v.picklist(CONFORMITY_VERDICTS), evidence: v.string(), comment: v.string() });
type Check = v.InferOutput<typeof CheckSchema>;

export const conformityChecker = defineRole({
  name: "conformity-checker",
  tag: "conformity",
  schema: (input: ConformityCheckerInput) =>
    v.object({
      decisions: v.pipe(v.array(CheckSchema), everyOnce<Check>(input.decisions.map((entry) => entry.id), (entry) => entry.id)),
      checklist: v.pipe(v.array(CheckSchema), everyOnce<Check>(input.checklist.map((entry) => entry.id), (entry) => entry.id)),
    }),
  values: (input: ConformityCheckerInput) => ({
    TICKET: ticket(input.ticket, input.notes),
    REPO: input.repo,
    DECISIONS: bullets(input.decisions.map((entry) => `${entry.id} : ${entry.text}`), "(aucune)"),
    CHECKLIST: bullets(input.checklist.map((entry) => `${entry.id} ${entry.text}`), "(aucune)"),
    BASE: input.base,
  }),
});
