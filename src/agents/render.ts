import { type Derogation, functionalId, GROUND_LABELS } from "../domain/derogation.ts";
import type { RelatedTicket, TicketSnapshot } from "../domain/ticket.ts";
import type { Exchange } from "../workflow/interview.ts";

export function bullets(lines: readonly string[], empty = "(rien)"): string {
  return lines.length ? lines.map((line) => `- ${line}`).join("\n") : empty;
}

export function transcript(exchanges: readonly Exchange[], empty = "(aucune question posee pour l'instant)"): string {
  if (exchanges.length === 0) return empty;
  return exchanges.map((exchange) => `- **${exchange.question.header}** — ${exchange.question.text}\n  Reponse : ${exchange.answer}`).join("\n");
}

interface Ruling {
  readonly question: string;
  readonly answer: string;
  readonly why: string;
  readonly overrides?: Derogation | null | undefined;
}

/** Numbered `F1`, `F2`…: the ids a technical derogation names. */
export function functionalArbitrages(entries: readonly Ruling[]): string {
  return bullets(entries.map((entry, index) => `${functionalId(index)} : ${entry.question} → ${entry.answer} (${entry.why})`), "(aucun arbitrage)");
}

export function technicalArbitrages(entries: readonly Ruling[]): string {
  return bullets(
    entries.map((entry) => {
      const derogation = entry.overrides ? ` — derogation a ${entry.overrides.functional} acceptee par l'humain (${GROUND_LABELS[entry.overrides.ground]})` : "";
      return `${entry.question} → ${entry.answer} (${entry.why})${derogation}`;
    }),
    "(aucun arbitrage)",
  );
}

/** Both framings, in their order of precedence: the functional one prevails over the ticket and over the technical one. */
export function framingArbitrages(functional: readonly Ruling[], technical: readonly Ruling[]): string {
  return [
    "Cadrage fonctionnel — il fait foi : il prime sur le ticket et sur le cadrage technique.",
    functionalArbitrages(functional),
    "",
    "Cadrage technique — le comment, subordonne au cadrage fonctionnel. Il ne s'en ecarte que par une derogation acceptee par l'humain, signalee comme telle.",
    technicalArbitrages(technical),
  ].join("\n");
}

type RenderedTicket = Pick<TicketSnapshot, "key" | "title" | "url" | "description" | "criteria"> & { readonly related?: readonly RelatedTicket[] };

export function ticket(snapshot: RenderedTicket, notes: string | null): string {
  return [
    `**${snapshot.key} — ${snapshot.title}** (${snapshot.url})`,
    "",
    snapshot.description.trim() || "(description vide)",
    "",
    "Criteres d'acceptation :",
    ...snapshot.criteria.map((criterion) => `- ${criterion.id} : ${criterion.text}`),
    ...relatedTickets(snapshot.related ?? []),
    ...(notes ? ["", launchNotes(notes)] : []),
  ].join("\n");
}

/** The --notes of start, for the roles that do not receive the ticket. */
export function launchNotes(notes: string | null): string {
  return notes ? `Notes de l'humain au lancement : ${notes}` : "(aucune)";
}

function relatedTickets(related: readonly RelatedTicket[]): string[] {
  if (related.length === 0) return [];
  return [
    "",
    "Tickets associes — du contexte : le perimetre reste celui du ticket ci-dessus.",
    ...related.flatMap((entry) =>
      "unavailable" in entry
        ? ["", `### ${entry.key} (${entry.relation}) — illisible : ${entry.unavailable}`]
        : ["", `### ${entry.key} — ${entry.title} (${entry.relation} ; ${entry.issueType}, ${entry.status}) ${entry.url}`, "", entry.description || "(description vide)"],
    ),
  ];
}

export function feedback(text: string | null): string {
  return text ? `## Retour a traiter en priorite\n\n${text}` : "";
}
