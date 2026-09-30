import * as v from "valibot";
import type { TicketSnapshot } from "../domain/ticket.ts";
import { feedback, ticket } from "./render.ts";
import { defineRole } from "./role.ts";
import { everyOnce, text } from "./shared.ts";

export interface FinalizerInput {
  readonly ticket: TicketSnapshot;
  readonly notes: string | null;
  readonly arbitrages: string;
  readonly plan: string;
  readonly repos: readonly { readonly repo: string; readonly commits: readonly string[] }[];
  readonly voice: string;
  readonly calibrated: boolean;
  readonly feedback: string | null;
}

export const finalizer = defineRole({
  name: "finalizer",
  tag: "publication",
  schema: (input: FinalizerInput) =>
    v.object({
      mergeRequests: v.pipe(
        v.array(v.object({ repo: text, summary: text })),
        everyOnce<{ repo: string; summary: string }>(input.repos.map((entry) => entry.repo), (entry) => entry.repo),
      ),
      slack: text,
      jira: text,
    }),
  values: (input: FinalizerInput) => ({
    TICKET: ticket(input.ticket, input.notes),
    ARBITRAGES: input.arbitrages,
    PLAN: input.plan,
    REPOS: input.repos.map((entry) => `### ${entry.repo}\n${entry.commits.map((commit) => `- ${commit}`).join("\n")}`).join("\n\n"),
    VOICE: input.voice,
    CALIBRATED: input.calibrated ? "oui" : "non : reste strictement factuel, n'imite aucun style",
    FEEDBACK: feedback(input.feedback),
  }),
});
