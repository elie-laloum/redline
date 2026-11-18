import assert from "node:assert/strict";
import { describe, it } from "bun:test";
import * as v from "valibot";
import { framingArbitrages } from "../../src/agents/render.ts";
import { functionalGrillSchema } from "../../src/agents/shared.ts";
import { flattenDocument, toDocument } from "../../src/domain/acceptance.ts";
import { respondentOf } from "../../src/domain/respondent.ts";
import { type FunctionalOutcome, renderStoryEdits } from "../../src/phases/framing/grills.ts";

const answered = (id: string, answer: string) => ({ question: { id }, answer });
const DIVERGENCE = { said: "La liste s'ouvre sur toutes les feuilles.", decided: "La liste s'ouvre sur le mois en cours.", why: "trop long a charger" };
const outcome = (overrides: Partial<FunctionalOutcome>): FunctionalOutcome => ({ arbitrages: [], contradictions: [], divergences: [], edits: [], respondent: null, ...overrides });

describe("qui repond au cadrage fonctionnel", () => {
  it("se lit dans les echanges, et reste inconnu tant que la question n'a pas ete posee", () => {
    assert.equal(respondentOf([answered("respondent", "Le PO")]), "po");
    assert.equal(respondentOf([answered("respondent", "Moi, en attendant la validation du PO"), answered("defaut", "Le PO")]), "developer");
    assert.equal(respondentOf([answered("defaut", "Mois en cours")]), null);
  });
});

describe("les passages de l'US reecrits", () => {
  it("doivent citer la description du ticket telle quelle, aux espaces pres", () => {
    const schema = functionalGrillSchema("La liste s'ouvre sur\ntoutes les feuilles.\n\nCriteres d'acceptation :\n- Une periode vide rend une erreur");
    const done = { done: true, questions: [], arbitrages: [], divergences: [], contradictions: [] };
    assert.equal(v.safeParse(schema, { ...done, edits: [{ before: "sur toutes   les feuilles", after: "sur le mois en cours" }] }).success, true);
    assert.equal(v.safeParse(schema, { ...done, edits: [{ before: "sur toutes les fiches", after: "sur le mois en cours" }] }).success, false);
  });

  it("sont presentes a la revue avec les divergences et ce qu'il adviendra de la fiche Jira", () => {
    const review = renderStoryEdits(outcome({ divergences: [DIVERGENCE], edits: [{ before: "toutes les feuilles", after: "le mois en cours" }], respondent: "po" })).join("\n");
    assert.match(review, /^Divergences avec l'US \(decidees par le PO\) :\n- L'US dit : La liste s'ouvre sur toutes les feuilles\. → decide : La liste s'ouvre sur le mois en cours\. \(trop long a charger\)/);
    assert.match(review, /Passages de l'US reecrits — le PO a repondu : ces seuls passages seront reecrits dans Jira a la cloture, le reste de la fiche est garde tel quel\.\n- « toutes les feuilles » → « le mois en cours »/);
    assert.deepEqual(renderStoryEdits(outcome({})), []);
  });

  it("disent aux agents en aval ou le fonctionnel s'ecarte du ticket", () => {
    const rendered = framingArbitrages({ arbitrages: [], divergences: [DIVERGENCE] }, []);
    assert.match(rendered, /Ce qu'ils changent au ticket, qu'ils completent ou modifient et sur lequel ils priment :\n- le ticket dit : La liste s'ouvre sur toutes les feuilles\. → decide : La liste s'ouvre sur le mois en cours\./);
  });
});

describe("un texte envoye a Jira", () => {
  it("garde ses retours a la ligne a l'interieur d'un paragraphe", () => {
    const comment = "Livre.\n\nCriteres d'acceptation :\n- Le mois en cours par defaut\n- Une periode vide rend une liste vide";
    assert.equal(flattenDocument(toDocument(comment)), "Livre.\nCriteres d'acceptation :\n- Le mois en cours par defaut\n- Une periode vide rend une liste vide\n");
  });
});
