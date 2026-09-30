import type { RelatedTicket, TicketSnapshot } from "../domain/ticket.ts";
import type { Exchange } from "../workflow/interview.ts";

export function bullets(lines: readonly string[], empty = "(rien)"): string {
  return lines.length ? lines.map((line) => `- ${line}`).join("\n") : empty;
}

export function transcript(exchanges: readonly Exchange[]): string {
  if (exchanges.length === 0) return "(aucune question posee pour l'instant)";
  return exchanges.map((exchange) => `- **${exchange.question.header}** — ${exchange.question.text}\n  Reponse : ${exchange.answer}`).join("\n");
}

export function arbitrages(entries: readonly { question: string; answer: string; why: string }[]): string {
  return bullets(entries.map((entry) => `${entry.question} → ${entry.answer} (${entry.why})`), "(aucun arbitrage)");
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
