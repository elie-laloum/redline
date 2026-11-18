import assert from "node:assert/strict";
import { describe, it } from "bun:test";
import * as v from "valibot";
import { outcomeNotice } from "../../src/cli/report.ts";
import { pointsToReview, type ReviewedPoint } from "../../src/domain/open-points.ts";
import { planProblems, PlanSchema } from "../../src/domain/plan.ts";
import { reviewPoints } from "../../src/phases/closing/open-points.ts";
import type { Publication } from "../../src/phases/closing/workflow.ts";
import type { Exchange } from "../../src/workflow/interview.ts";
import { plan } from "../kit/framing.ts";

const P1 = { id: "P1", text: "Qui supprime la route de report ?" };
const P2 = { id: "P2", text: "Les ecritures importees hors periode sont-elles rattachees ?" };
const DIVERGENCE = { said: "La liste s'ouvre sur toutes les feuilles.", decided: "La liste s'ouvre sur le mois en cours.", why: "trop long a charger" };
const answered = (id: string, answer: string): Exchange => ({ question: { id, header: id, text: id, options: [] }, answer, answeredAt: "2026-11-18T10:00:00.000Z" });

describe("les points ouverts", () => {
  it("portent un identifiant unique dans tout le plan", () => {
    const planned = { ...plan(), openPoints: [P1, { ...P2, id: "P1" }] };
    assert.equal(v.safeParse(PlanSchema, { ...planned, openPoints: ["Qui supprime la route ?"] }).success, false);
    const context = { criteria: [{ id: "AC1", text: "La periode par defaut est le mois en cours" }], scope: [{ repo: "fixture-core", level: 1, area: "zone", evidence: [] }], repos: [], types: ["feature"] };
    assert.ok(planProblems(v.parse(PlanSchema, planned), context).includes("l'identifiant P1 apparait plusieurs fois"));
  });

  it("comptent les divergences avec l'US quand le developpeur a repondu, en attente du PO", () => {
    assert.deepEqual(
      pointsToReview([P1], { divergences: [DIVERGENCE], respondent: "developer" }).map((point) => point.id),
      ["P1", "D1"],
    );
    assert.match(pointsToReview([], { divergences: [DIVERGENCE], respondent: "developer" })[0]?.text ?? "", /^A valider par le PO : l'US dit « La liste s'ouvre sur toutes les feuilles\. »/);
    assert.deepEqual(pointsToReview([P1], { divergences: [DIVERGENCE], respondent: "po" }), [P1]);
  });

  it("sont tous reposes avant de demander la decision de ceux qui sont tranches", () => {
    const first = reviewPoints([P1, P2], []);
    assert.ok("ask" in first);
    assert.deepEqual(first.ask.map((question) => [question.id, question.options]), [
      ["point-P1", ["Tranche", "Reporte hors du perimetre", "Encore ouvert"]],
      ["point-P2", ["Tranche", "Reporte hors du perimetre", "Encore ouvert"]],
    ]);

    const second = reviewPoints([P1, P2], [answered("point-P1", "Tranche"), answered("point-P2", "Encore ouvert")]);
    assert.ok("ask" in second);
    assert.deepEqual(second.ask.map((question) => question.id), ["decision-P1"]);

    const done = reviewPoints([P1, P2], [answered("point-P1", "Tranche"), answered("point-P2", "Encore ouvert"), answered("decision-P1", "Le back la supprime au sprint suivant.")]);
    assert.deepEqual(done, {
      done: [
        { ...P1, status: "settled", decision: "Le back la supprime au sprint suivant." },
        { ...P2, status: "open", decision: null },
      ],
    });
  });

  it("restent ouverts quand la reponse n'est aucun des choix", () => {
    const done = reviewPoints([P1], [answered("point-P1", "je ne sais pas")]);
    assert.deepEqual(done, { done: [{ ...P1, status: "open", decision: null }] });
  });

  it("ne posent aucune question quand le plan n'en a pas", () => {
    assert.deepEqual(reviewPoints([], []), { done: [] });
  });

  it("font annoncer une livraison avec reserves tant qu'il en reste d'ouverts", () => {
    const publication = (openPoints: readonly ReviewedPoint[]): Publication => ({
      memory: { operations: [], commit: null },
      mergeRequests: [{ repo: "fixture-core", project: "g/core", iid: 1, url: "https://forge/1" }],
      slack: null,
      jira: { transition: null, commented: true, edits: { applied: 0, missed: [] } },
      openPoints,
      conformity: [],
    });
    const reserved = outcomeNotice("FT-1", { status: "done", publication: publication([{ ...P1, status: "open", decision: null }, { ...P2, status: "deferred", decision: null }]) });
    assert.deepEqual(reserved, { tone: "warning", text: "FT-1 livre avec reserves : 1 MR, 1 point(s) encore ouvert(s) (P1)." });
    const clean = outcomeNotice("FT-1", { status: "done", publication: publication([{ ...P2, status: "deferred", decision: null }]) });
    assert.deepEqual(clean, { tone: "success", text: "FT-1 publie : 1 MR." });
  });
});
