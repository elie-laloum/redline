/** What an adversary held against one round: how many findings, and the files they cite. */
export interface RoundFindings {
  readonly count: number;
  readonly files: readonly string[];
}

/** A file cited in this many consecutive rounds, the latest included, is named as blocking. */
const BLOCKING_ROUNDS = 3;

/** The file part of a `file:line` citation, or the citation itself when it names no line. */
export function citedFile(evidence: string): string {
  return evidence.trim().replace(/:\d+(?::\d+)?(?:[-–]\d+)?$/, "");
}

export function readRounds(memo: unknown): RoundFindings[] {
  const rounds = (memo as { rounds?: unknown } | undefined)?.rounds;
  return Array.isArray(rounds) ? (rounds as RoundFindings[]) : [];
}

/**
 * Said when an adversary spends its last turn: whether its findings decrease round after round — a
 * slow convergence, one more turn would likely do — or not, a critic without a stopping point whose
 * scope needs bounding; and the file it has cited in every recent round, if any.
 */
export function trendNote(rounds: readonly RoundFindings[]): string {
  if (rounds.length < 2) return "";
  const counts = rounds.map((round) => round.count);
  const decreasing = counts.every((count, index) => index === 0 || count <= (counts[index - 1] ?? count)) && (counts.at(-1) ?? 0) < (counts[0] ?? 0);
  const trend = decreasing
    ? `Constats par tour : ${counts.join(" → ")}. Ils decroissent : convergence lente, un tour de plus suffirait sans doute.`
    : `Constats par tour : ${counts.join(" → ")}. Ils ne decroissent pas : l'adversaire n'a pas de point d'arret, borne son perimetre plutot que d'ajouter des tours.`;
  const recent = rounds.slice(-BLOCKING_ROUNDS);
  const blocking = recent.length < BLOCKING_ROUNDS ? [] : [...new Set(recent[0]?.files ?? [])].filter((file) => file && recent.every((round) => round.files.includes(file)));
  const files = blocking.map((file) => `${file} est cite a chacun des ${BLOCKING_ROUNDS} derniers tours : s'il n'est pas demande par la checklist, le supprimer de la branche avant de reprendre.`);
  return [trend, ...files].join("\n");
}
