import type { Task } from "@elie-laloum/outpost/workflows";
import { digest } from "../../domain/digest.ts";
import { decisionQuestionId, POINT_CHOICES, pointStatus, pointsToReview, type ReviewedPoint, reviewedPoint, statusQuestionId } from "../../domain/open-points.ts";
import type { OpenPoint } from "../../domain/plan.ts";
import { defineInterview, type Exchange, type Interviewed, type Question, type Turn } from "../../workflow/interview.ts";
import { HUMAN } from "../run.ts";
import type { ClosingContext } from "./context.ts";

const STATUS_TEXT = [
  "Ce point est reste ouvert pendant la livraison. Ou en est-il ?",
  "",
  "- Tranche : tu donnes la decision, elle rejoint les arbitrages de la MR ;",
  "- Reporte hors du perimetre : assume, il part dans la description de la MR ;",
  "- Encore ouvert : la MR part avec ce point en tete, le run finit livre avec reserves et le ticket Jira garde son statut.",
].join("\n");

/**
 * Every open point is asked first, then the decision of each one the human settled. A run with no
 * open point asks nothing.
 */
export function reviewPoints(points: readonly OpenPoint[], transcript: readonly Exchange[]): Turn<readonly ReviewedPoint[]> {
  const asked = new Set(transcript.map((exchange) => exchange.question.id));
  const statuses = points.filter((point) => !asked.has(statusQuestionId(point))).map((point): Question => ({
    id: statusQuestionId(point),
    header: `Point ouvert ${point.id}`,
    text: `${point.text}\n\n${STATUS_TEXT}`,
    options: Object.keys(POINT_CHOICES),
    freeText: false,
  }));
  if (statuses.length) return { ask: statuses };
  const decisions = points
    .filter((point) => pointStatus(point, transcript) === "settled" && !asked.has(decisionQuestionId(point)))
    .map((point): Question => ({ id: decisionQuestionId(point), header: `Decision sur ${point.id}`, text: `${point.text}\n\nQuelle decision as-tu prise ? Elle est reprise telle quelle dans la MR.`, options: [] }));
  if (decisions.length) return { ask: decisions };
  return { done: points.flatMap((point) => reviewedPoint(point, transcript) ?? []) };
}

export function openPointsTask(run: ClosingContext): Task<Interviewed<readonly ReviewedPoint[]>> {
  const points = pointsToReview(run.framing.plan.openPoints, run.framing.functional);
  return defineInterview<readonly ReviewedPoint[]>({
    key: "open-points",
    workflow: "redline.closing",
    title: "Points ouverts",
    actors: [HUMAN],
    maxTurns: 2,
    memo: { store: run.cache, version: "open-points-1", key: () => digest({ points }) },
    think: async (_context, transcript) => reviewPoints(points, transcript),
  });
}
