import * as v from "valibot";
import { COMMIT_TYPES } from "../domain/commit-message.ts";

export const text = v.pipe(v.string(), v.trim(), v.minLength(1));

export const ContradictionSchema = v.object({ note: text, claim: text, evidence: text });

export const ArbitrageSchema = v.object({ question: text, answer: text, why: text });

export const QuestionSchema = v.object({ id: text, header: text, text: text, options: v.pipe(v.array(text), v.maxLength(5)) });

export const CommitIntentSchema = v.object({
  type: v.picklist(COMMIT_TYPES),
  scope: v.optional(v.nullable(v.string())),
  subject: text,
  body: v.optional(v.nullable(v.string())),
});

export const LineVerdictSchema = v.object({
  id: text,
  verdict: v.picklist(["passe", "manque"]),
  evidence: text,
  comment: v.string(),
});

export type LineVerdict = v.InferOutput<typeof LineVerdictSchema>;

export function everyOnce<T>(expected: readonly string[], key: (item: T) => string) {
  return v.check<T[], string>((items) => {
    const keys = items.map(key).sort();
    return keys.length === expected.length && keys.join() === [...expected].sort().join();
  }, `une entree par identifiant attendu, ni plus ni moins : ${expected.join(", ")}`);
}

export function grillSchema() {
  return v.pipe(
    v.object({
      done: v.boolean(),
      questions: v.array(QuestionSchema),
      arbitrages: v.array(ArbitrageSchema),
      contradictions: v.array(ContradictionSchema),
    }),
    v.check((reply) => (reply.done ? reply.questions.length === 0 : reply.questions.length > 0), "done:true sans question, ou done:false avec au moins une question"),
  );
}

export type GrillReply = v.InferOutput<ReturnType<typeof grillSchema>>;
