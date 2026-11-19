import * as v from "valibot";
import { text } from "./shared.ts";
import { defineRole } from "./role.ts";

export interface RunExplainerInput {
  readonly key: string;
  readonly title: string;
  readonly question: string;
  /** The task the question is about, by its dashboard label; null for a question about the run. */
  readonly task: string | null;
  /** The journal lines the question needs, oldest first. */
  readonly brief: string;
}

export const runExplainer = defineRole({
  name: "run-explainer",
  tag: "insight",
  schema: v.object({
    findings: v.pipe(v.array(v.object({ headline: v.pipe(text, v.maxLength(140)), detail: text })), v.minLength(1), v.maxLength(5)),
    conclusion: text,
  }),
  values: (input: RunExplainerInput) => ({
    TICKET: `${input.key} — ${input.title}`,
    QUESTION: input.question,
    TASK: input.task ?? "(le run entier)",
    BRIEF: input.brief,
  }),
});
