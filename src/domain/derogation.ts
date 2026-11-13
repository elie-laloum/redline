/**
 * The functional framing prevails over the ticket and over the technical framing. A technical
 * arbitrage departs from a functional one only on these grounds, and only once the human accepts it.
 */
export const DEROGATION_GROUNDS = ["impossibilite-technique", "raison-metier"] as const;
export type DerogationGround = (typeof DEROGATION_GROUNDS)[number];

export const GROUND_LABELS: Readonly<Record<DerogationGround, string>> = {
  "impossibilite-technique": "impossibilite technique",
  "raison-metier": "raison metier",
};

export const ACCEPT_DEROGATION = "Accepter la derogation";
export const REFUSE_DEROGATION = "Refuser : le fonctionnel prime";

export interface Derogation {
  /** `F<n>`: the position of the functional arbitrage it departs from, counted from 1. */
  readonly functional: string;
  readonly ground: DerogationGround;
}

interface Ruled {
  readonly question: { readonly id: string };
  readonly answer: string;
}

export function functionalId(index: number): string {
  return `F${index + 1}`;
}

export function derogationQuestionId(functional: string): string {
  return `derogation-${functional}`;
}

/** The human's ruling on each functional arbitrage a derogation was asked for: true when accepted. */
export function derogationRulings(transcript: readonly Ruled[]): ReadonlyMap<string, boolean> {
  const rulings = new Map<string, boolean>();
  for (const exchange of transcript) {
    const functional = /^derogation-(F\d+)$/.exec(exchange.question.id)?.[1];
    if (functional) rulings.set(functional, exchange.answer === ACCEPT_DEROGATION);
  }
  return rulings;
}

export function refusedDerogations(transcript: readonly Ruled[]): string[] {
  return [...derogationRulings(transcript)].filter(([, accepted]) => !accepted).map(([functional]) => functional);
}
