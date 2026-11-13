import * as v from "valibot";
import { COMMIT_TYPES } from "../domain/commit-message.ts";
import { DEROGATION_GROUNDS } from "../domain/derogation.ts";

export const text = v.pipe(v.string(), v.trim(), v.minLength(1));

export const ContradictionSchema = v.object({ note: text, claim: text, evidence: text });

export const ArbitrageSchema = v.object({ question: text, answer: text, why: text });

export const DerogationSchema = v.object({ functional: v.pipe(v.string(), v.regex(/^F[1-9]\d*$/, "arbitrage fonctionnel attendu : F1, F2…")), ground: v.picklist(DEROGATION_GROUNDS) });

/** A technical arbitrage, which names the functional arbitrage it departs from, if any. */
export const TechnicalArbitrageSchema = v.object({ ...ArbitrageSchema.entries, overrides: v.optional(v.nullable(DerogationSchema)) });

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

const QUESTIONS_MATCH_DONE = "done:true sans question, ou done:false avec au moins une question";

function questionsMatchDone(reply: { done: boolean; questions: readonly unknown[] }): boolean {
  return reply.done ? reply.questions.length === 0 : reply.questions.length > 0;
}

export function grillSchema() {
  return v.pipe(
    v.object({
      done: v.boolean(),
      questions: v.array(QuestionSchema),
      arbitrages: v.array(ArbitrageSchema),
      contradictions: v.array(ContradictionSchema),
    }),
    v.check((reply) => questionsMatchDone(reply), QUESTIONS_MATCH_DONE),
  );
}

/**
 * `functional` counts the functional arbitrages a derogation may name; `refused` lists those whose
 * derogation the human already refused, which no arbitrage may depart from again.
 */
export function technicalGrillSchema(functional: number, refused: readonly string[]) {
  return v.pipe(
    v.object({
      done: v.boolean(),
      questions: v.array(QuestionSchema),
      arbitrages: v.array(TechnicalArbitrageSchema),
      contradictions: v.array(ContradictionSchema),
    }),
    v.check((reply) => questionsMatchDone(reply), QUESTIONS_MATCH_DONE),
    v.check(
      (reply) => reply.arbitrages.every((entry) => !entry.overrides || Number(entry.overrides.functional.slice(1)) <= functional),
      `une derogation nomme un arbitrage fonctionnel qui n'existe pas (F1 a F${functional})`,
    ),
    v.check(
      (reply) => reply.arbitrages.every((entry) => !entry.overrides || !refused.includes(entry.overrides.functional)),
      `l'humain a refuse de deroger a ${refused.join(", ")} : le fonctionnel prime, trouve une autre voie`,
    ),
  );
}

export type GrillReply = v.InferOutput<ReturnType<typeof grillSchema>>;
export type TechnicalGrillReply = v.InferOutput<ReturnType<typeof technicalGrillSchema>>;
