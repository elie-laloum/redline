import type { OpenPoint } from "./plan.ts";
import type { Respondent } from "./respondent.ts";

export const OPEN_POINT_STATUSES = ["settled", "deferred", "open"] as const;
export type OpenPointStatus = (typeof OPEN_POINT_STATUSES)[number];

export const POINT_CHOICES: Readonly<Record<string, OpenPointStatus>> = {
  Tranche: "settled",
  "Reporte hors du perimetre": "deferred",
  "Encore ouvert": "open",
};

export interface ReviewedPoint extends OpenPoint {
  readonly status: OpenPointStatus;
  /** The human's ruling, when the point is settled; null otherwise. */
  readonly decision: string | null;
}

interface Divergence {
  readonly said: string;
  readonly decided: string;
  readonly why: string;
}

interface Answered {
  readonly question: { readonly id: string };
  readonly answer: string;
}

export function statusQuestionId(point: OpenPoint): string {
  return `point-${point.id}`;
}

export function decisionQuestionId(point: OpenPoint): string {
  return `decision-${point.id}`;
}

/**
 * The plan's open points, then, when the developer answered the functional framing, one point per
 * divergence from the ticket, `D1`, `D2`…: each one waits for the product owner's validation.
 */
export function pointsToReview(plan: readonly OpenPoint[], functional: { readonly divergences: readonly Divergence[]; readonly respondent: Respondent | null }): OpenPoint[] {
  const awaiting = functional.respondent === "developer" ? functional.divergences : [];
  return [
    ...plan,
    ...awaiting.map((entry, index) => ({ id: `D${index + 1}`, text: `A valider par le PO : l'US dit « ${entry.said} », le cadrage decide « ${entry.decided} » (${entry.why}).` })),
  ];
}

/** Null until the human answered; an answer that is none of the choices leaves the point open. */
export function pointStatus(point: OpenPoint, transcript: readonly Answered[]): OpenPointStatus | null {
  const answer = transcript.findLast((exchange) => exchange.question.id === statusQuestionId(point))?.answer;
  return answer === undefined ? null : (POINT_CHOICES[answer] ?? "open");
}

/** Null for a point the transcript has not ruled on yet; a settled point needs its decision too. */
export function reviewedPoint(point: OpenPoint, transcript: readonly Answered[]): ReviewedPoint | null {
  const status = pointStatus(point, transcript);
  if (status === null) return null;
  if (status !== "settled") return { ...point, status, decision: null };
  const decision = transcript.findLast((exchange) => exchange.question.id === decisionQuestionId(point))?.answer;
  return decision === undefined ? null : { ...point, status, decision };
}

export function stillOpen(points: readonly ReviewedPoint[]): ReviewedPoint[] {
  return points.filter((point) => point.status === "open");
}

export function renderReviewedPoint(point: ReviewedPoint): string {
  return point.decision ? `${point.id} ${point.text} → ${point.decision}` : `${point.id} ${point.text}`;
}
