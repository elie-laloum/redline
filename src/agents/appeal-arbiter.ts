import * as v from "valibot";
import type { PlanTest } from "../domain/plan.ts";
import { bullets, launchNotes } from "./render.ts";
import { defineRole } from "./role.ts";
import { CommitIntentSchema, text } from "./shared.ts";

export interface Appeal {
  readonly kind: "zone-non-couverte" | "test-conteste";
  readonly test: string | null;
  readonly reason: string;
}

export interface AppealArbiterInput {
  readonly repo: string;
  readonly notes: string | null;
  readonly tests: readonly PlanTest[];
  readonly appeal: Appeal;
  readonly previous: readonly string[];
}

export const appealArbiter = defineRole({
  name: "appeal-arbiter",
  tag: "arbitrage",
  schema: v.pipe(
    v.object({ decision: v.picklist(["accepte", "refuse"]), reason: text, commit: v.nullable(CommitIntentSchema) }),
    v.check((reply) => reply.decision === "refuse" || reply.commit !== null, "un recours accepte se traduit par un commit de test"),
  ),
  values: (input: AppealArbiterInput) => ({
    REPO: input.repo,
    TESTS: bullets(input.tests.map((test) => `${test.id} [${test.kind}] ${test.criterion}`)),
    APPEAL: `${input.appeal.kind}${input.appeal.test ? ` sur ${input.appeal.test}` : ""} — ${input.appeal.reason}`,
    PREVIOUS: bullets(input.previous, "(premier recours sur ce sujet)"),
    NOTES: launchNotes(input.notes),
  }),
});
