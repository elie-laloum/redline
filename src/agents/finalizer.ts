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
  /** The channels the run publishes to: a text nobody will read is not written. */
  readonly channels: { readonly slack: boolean; readonly jira: boolean };
  readonly feedback: string | null;
}

const SKIPPED = v.literal("");

export const finalizer = defineRole({
  name: "finalizer",
  tag: "publication",
  schema: (input: FinalizerInput) =>
    v.object({
      mergeRequests: v.pipe(
        v.array(v.object({ repo: text, summary: text })),
        everyOnce<{ repo: string; summary: string }>(input.repos.map((entry) => entry.repo), (entry) => entry.repo),
      ),
      slack: input.channels.slack ? text : SKIPPED,
      jira: input.channels.jira ? text : SKIPPED,
    }),
  values: (input: FinalizerInput) => ({
    TICKET: ticket(input.ticket, input.notes),
    ARBITRAGES: input.arbitrages,
    PLAN: input.plan,
    REPOS: input.repos.map((entry) => `### ${entry.repo}\n${entry.commits.map((commit) => `- ${commit}`).join("\n")}`).join("\n\n"),
    VOICE: input.voice,
    CALIBRATED: input.calibrated ? "oui" : "non : reste strictement factuel, n'imite aucun style",
    SLACK: input.channels.slack
      ? "le message d'ouverture du canal, dans la voix ci-dessus. Pas de titre, pas de liste dans un message court. Redline ajoute les liens des merge requests a la fin."
      : "une chaine vide : Slack est desactive, rien n'y sera publie.",
    JIRA: input.channels.jira
      ? "le commentaire du ticket, qui reprend les decisions fonctionnelles prises pendant le cadrage."
      : "une chaine vide : les ecritures Jira sont desactivees, le ticket ne sera pas commente.",
    FEEDBACK: feedback(input.feedback),
  }),
});
