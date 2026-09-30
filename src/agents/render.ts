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

export function ticket(snapshot: { key: string; title: string; url: string; description: string; criteria: readonly { id: string; text: string }[] }, notes: string | null): string {
  return [
    `**${snapshot.key} — ${snapshot.title}** (${snapshot.url})`,
    "",
    snapshot.description.trim() || "(description vide)",
    "",
    "Criteres d'acceptation :",
    ...snapshot.criteria.map((criterion) => `- ${criterion.id} : ${criterion.text}`),
    ...(notes ? ["", `Notes de l'humain au lancement : ${notes}`] : []),
  ].join("\n");
}

export function feedback(text: string | null): string {
  return text ? `## Retour a traiter en priorite\n\n${text}` : "";
}
