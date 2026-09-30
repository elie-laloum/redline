import type { Task } from "@elie-laloum/outpost";
import { renderPlan, type Plan } from "../../domain/plan.ts";
import { type TicketSnapshot, titleDrift } from "../../domain/ticket.ts";
import type { Converged } from "../../workflow/converge.ts";
import { defineInterview, type Exchange, type Interviewed, type Turn } from "../../workflow/interview.ts";
import { HUMAN, type RunContext } from "../run.ts";
import { renderScope } from "./grills.ts";
import type { ScopeOutcome } from "./scope.ts";

export type Decision = "approve" | "amend" | "reject-functional" | "reject-technical";

export interface Review {
  readonly decision: Decision;
  readonly note: string | null;
}

export const CHOICES: Readonly<Record<string, Decision>> = {
  Approuver: "approve",
  "Amender le plan": "amend",
  "Rejeter : revoir le fonctionnel": "reject-functional",
  "Rejeter : revoir le technique": "reject-technical",
};

export function decide(transcript: readonly Exchange[], summary: string): Turn<Review> {
  const [decision, note] = transcript;
  if (!decision) {
    return { ask: [{ id: "decision", header: "Validation du plan", text: summary, options: Object.keys(CHOICES), freeText: false }] };
  }
  const chosen = CHOICES[decision.answer] ?? "amend";
  if (chosen === "approve") return { done: { decision: chosen, note: null } };
  if (!note) return { ask: [{ id: "note", header: "Ce qui doit changer", text: "Dis precisement ce qui doit changer : la note est transmise telle quelle.", options: [] }] };
  return { done: { decision: chosen, note: note.answer } };
}

export function reviewInterview(run: RunContext, deps: { ticket: Task<TicketSnapshot>; scope: Task<ScopeOutcome>; plan: Task<Converged<Plan>> }): Task<Interviewed<Review>> {
  return defineInterview<Review>({
    key: "review",
    workflow: "redline.framing",
    title: "Revue du plan",
    actors: [HUMAN],
    after: [deps.ticket, deps.scope, deps.plan],
    maxTurns: 2,
    think: async (context, transcript) => {
      const ticket = context.value(deps.ticket);
      const drift = titleDrift({ title: run.ledger.title }, ticket) ? [`Attention : le titre Jira a change depuis le lancement (« ${run.ledger.title} » → « ${ticket.title} »). Les noms de branche gardent le premier.`, ""] : [];
      const summary = [...drift, renderScope(context.value(deps.scope).scope), "", renderPlan(context.value(deps.plan).candidate)].join("\n");
      return decide(transcript, summary);
    },
  });
}
