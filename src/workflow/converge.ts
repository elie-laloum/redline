import { defineLoopTask, type LoopTaskContext, type Task, type TaskCacheOptions, type TaskContext, type WorkflowJson } from "@elie-laloum/outpost";
import { Escalation } from "./escalation.ts";

export type Verdict =
  | { readonly kind: "pass"; readonly memo?: WorkflowJson }
  | { readonly kind: "feedback"; readonly text: string; readonly memo?: WorkflowJson }
  | { readonly kind: "environment"; readonly text: string }
  | { readonly kind: "arbitrage"; readonly text: string };

export interface Carry {
  readonly round: number;
  readonly spent: Readonly<Record<string, number>>;
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
        if (verdict.kind === "pass") continue;
        const spent = (carry.spent[gate.name] ?? 0) + 1;
        if (spent > gate.budget) {
          throw new Escalation("convergence", `${options.key}/${gate.name}`, `budget de ${gate.budget} tour(s) epuise. Dernier retour : ${verdict.text}`);
        }
        const next: Carry = { round: carry.round + 1, spent: { ...carry.spent, [gate.name]: spent }, feedback: { gate: gate.name, text: verdict.text }, memo };
        return { done: false, feedback: JSON.stringify(next) };
      }
      return { done: true };
    },
  });
}

function initial(seed: string | null): Carry {
  return { round: 1, spent: {}, feedback: seed ? { gate: "humain", text: seed } : null, memo: {} };
}

function decode(feedback: string): Carry {
  return JSON.parse(feedback) as Carry;
}
