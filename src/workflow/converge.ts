import { defineLoopTask, type LoopTaskContext, type Task, type TaskCacheOptions, type TaskContext, type WorkflowJson } from "@elie-laloum/outpost";
import type { RunObserver } from "../domain/run-events.ts";
import { Escalation } from "./escalation.ts";

export type Verdict =
  | { readonly kind: "pass"; readonly memo?: WorkflowJson }
  | { readonly kind: "feedback"; readonly text: string; readonly memo?: WorkflowJson }
  | { readonly kind: "environment"; readonly text: string }
  | { readonly kind: "arbitrage"; readonly text: string };

export interface Carry {
  readonly round: number;
  readonly spent: Readonly<Record<string, number>>;
  /** The note the human gave when reopening this generation. Unlike `feedback`, it outlives the first round. */
  readonly seed: string | null;
  readonly feedback: { readonly gate: string; readonly text: string } | null;
  readonly memo: Readonly<Record<string, WorkflowJson>>;
}

export interface Gate<C> {
  readonly name: string;
  readonly budget: number;
  judge(context: LoopTaskContext, candidate: C, carry: Carry): Promise<Verdict>;
}

export interface Converged<C> {
  readonly candidate: C;
  readonly carry: Carry;
}

export interface ConvergeOptions<C> {
  readonly key: string;
  readonly after?: readonly Task[];
  readonly seed?: (context: TaskContext) => string | null;
  readonly make: (context: LoopTaskContext, carry: Carry) => Promise<C>;
  readonly gates: readonly Gate<C>[];
  readonly cache?: TaskCacheOptions;
  readonly timeoutMs?: number;
  readonly events?: RunObserver;
}

export function converge<C>(options: ConvergeOptions<C>): Task<Converged<C>> {
  const maxRounds = 1 + options.gates.reduce((total, gate) => total + gate.budget, 0);
  return defineLoopTask<Converged<C>>({
    key: options.key,
    after: options.after,
    cache: options.cache,
    timeoutMs: options.timeoutMs,
    maxRounds,
    async attempt(context, feedback) {
      const carry = feedback ? decode(feedback) : initial(options.seed?.(context) ?? null);
      return { candidate: await options.make(context, carry), carry };
    },
    async check(context, { candidate, carry }) {
      const memo: Record<string, WorkflowJson> = { ...carry.memo };
      for (const gate of options.gates) {
        const verdict = await gate.judge(context, candidate, { ...carry, memo });
        if (verdict.kind === "environment" || verdict.kind === "arbitrage") throw new Escalation(verdict.kind, `${options.key}/${gate.name}`, verdict.text);
        if (verdict.memo !== undefined) memo[gate.name] = verdict.memo;
        const spent = (carry.spent[gate.name] ?? 0) + (verdict.kind === "pass" ? 0 : 1);
        options.events?.({
          type: "gate",
          task: options.key,
          gate: gate.name,
          round: carry.round,
          verdict: verdict.kind,
          spent,
          budget: gate.budget,
          text: verdict.kind === "pass" ? null : verdict.text,
        });
        if (verdict.kind === "pass") continue;
        if (spent > gate.budget) {
          throw new Escalation("convergence", `${options.key}/${gate.name}`, `budget de ${gate.budget} tour(s) epuise. Dernier retour : ${verdict.text}`);
        }
        const next: Carry = { round: carry.round + 1, spent: { ...carry.spent, [gate.name]: spent }, seed: carry.seed, feedback: { gate: gate.name, text: verdict.text }, memo };
        return { done: false, feedback: JSON.stringify(next) };
      }
      return { done: true };
    },
  });
}

/**
 * What the maker must act on this round: the refusal that sent it back, with the human note
 * restated under it. `feedback` is the gate's channel from the second round on, so the note
 * would otherwise be read once and never again — on a loop that takes several rounds, which is
 * the ordinary case, a human would be instructing nobody.
 */
export function briefOf(carry: Carry): string | null {
  const refusal = carry.feedback?.text ?? null;
  if (!carry.seed || carry.feedback?.gate === "humain") return refusal;
  return refusal ? `${refusal}\n\nNote de l'humain a la reprise, valable a chaque tour :\n${carry.seed}` : carry.seed;
}

function initial(seed: string | null): Carry {
  return { round: 1, spent: {}, seed, feedback: seed ? { gate: "humain", text: seed } : null, memo: {} };
}

/** `seed` is absent from a checkpoint an earlier version wrote. */
function decode(feedback: string): Carry {
  const carry = JSON.parse(feedback) as Carry;
  return { ...carry, seed: carry.seed ?? null };
}
