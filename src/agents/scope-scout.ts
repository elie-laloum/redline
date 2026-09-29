import * as v from "valibot";
import type { RepoEntry } from "../domain/config.ts";
import type { TicketSnapshot } from "../domain/ticket.ts";
import { feedback, ticket } from "./render.ts";
import { defineRole } from "./role.ts";
import { ContradictionSchema, text } from "./shared.ts";

export interface ScopeScoutInput {
  readonly ticket: TicketSnapshot;
  readonly functional: string;
  readonly repo: RepoEntry;
  readonly path: string;
  readonly memory: string;
  readonly feedback: string | null;
}

export const scopeScout = defineRole({
  name: "scope-scout",
  tag: "scope",
  schema: v.pipe(
    v.object({ impacted: v.boolean(), area: v.string(), evidence: v.array(text), reason: text, contradictions: v.array(ContradictionSchema) }),
    v.check((reply) => !reply.impacted || reply.evidence.length > 0, "un repo impacte porte au moins une preuve fichier:ligne"),
  ),
  values: (input: ScopeScoutInput) => ({
    TICKET: ticket(input.ticket, null),
    FUNCTIONAL: input.functional,
    REPO: `${input.repo.name} (level ${input.repo.level}, ${input.repo.layer}) — ${input.repo.description}`,
    REPO_PATH: input.path,
    MEMORY: input.memory,
    FEEDBACK: feedback(input.feedback),
  }),
});
