import assert from "node:assert/strict";
import { describe, it } from "bun:test";
import * as v from "valibot";
import { framingArbitrages } from "../../src/agents/render.ts";
import { technicalGrillSchema } from "../../src/agents/shared.ts";
import { ACCEPT_DEROGATION, derogationRulings, REFUSE_DEROGATION, refusedDerogations } from "../../src/domain/derogation.ts";
import { derogationQuestions } from "../../src/phases/framing/grills.ts";

const FUNCTIONAL = [
  { question: "Periode par defaut ?", answer: "Mois en cours", why: "choix du PO" },
  { question: "Redater l'import ?", answer: "Oui, au premier jour de l'exercice", why: "choix du PO" },
];
const plain = { question: "Ou vit le filtre ?", answer: "Dans clamp", why: "src/period.js:1", overrides: null };
const departing = { question: "Redate-t-on l'import ?", answer: "Non", why: "src/import.js:40 fige la date", overrides: { functional: "F2", ground: "impossibilite-technique" as const } };
const reply = (arbitrages: unknown[]) => ({ done: true, questions: [], arbitrages, contradictions: [] });
const ruled = (functional: string, answer: string) => ({ question: { id: `derogation-${functional}`, header: "", text: "", options: [] }, answer, answeredAt: "" });

describe("une derogation du cadrage technique au fonctionnel", () => {
  it("devient une question a l'humain tant qu'il ne l'a pas tranchee", () => {
    const parsed = v.parse(technicalGrillSchema(FUNCTIONAL.length, []), reply([plain, departing]));
    const [question, ...others] = derogationQuestions(parsed, FUNCTIONAL, []);
    assert.deepEqual(others, []);
    assert.equal(question?.id, "derogation-F2");
    assert.deepEqual(question?.options, [ACCEPT_DEROGATION, REFUSE_DEROGATION]);
    assert.equal(question?.freeText, false);
    assert.match(question?.text ?? "", /F2 : Redater l'import \? → Oui, au premier jour de l'exercice/);
    assert.match(question?.text ?? "", /Motif \(impossibilite technique\) : src\/import\.js:40 fige la date/);
  });

  it("n'est plus posee une fois tranchee, acceptee ou refusee", () => {
    const parsed = v.parse(technicalGrillSchema(FUNCTIONAL.length, []), reply([departing]));
    assert.deepEqual(derogationQuestions(parsed, FUNCTIONAL, [ruled("F2", ACCEPT_DEROGATION)]), []);
    assert.deepEqual(derogationQuestions(parsed, FUNCTIONAL, [ruled("F2", REFUSE_DEROGATION)]), []);
  });

  it("lit la decision de l'humain dans les echanges, la derniere l'emportant", () => {
    const transcript = [ruled("F1", REFUSE_DEROGATION), ruled("F2", REFUSE_DEROGATION), ruled("F2", ACCEPT_DEROGATION), { question: { id: "defaut" }, answer: ACCEPT_DEROGATION }];
    assert.deepEqual([...derogationRulings(transcript)], [
      ["F1", false],
      ["F2", true],
    ]);
    assert.deepEqual(refusedDerogations(transcript), ["F1"]);
  });

  it("est refusee a la reponse quand elle vise un arbitrage refuse ou inexistant", () => {
    assert.equal(v.safeParse(technicalGrillSchema(FUNCTIONAL.length, ["F2"]), reply([departing])).success, false);
    assert.equal(v.safeParse(technicalGrillSchema(1, []), reply([departing])).success, false);
    assert.equal(v.safeParse(technicalGrillSchema(FUNCTIONAL.length, ["F1"]), reply([departing])).success, true);
  });
});

describe("les arbitrages donnes aux agents", () => {
  it("disent que le fonctionnel fait foi, puis signalent chaque derogation acceptee", () => {
    const rendered = framingArbitrages(FUNCTIONAL, [plain, departing]);
    assert.equal(
      rendered,
      [
        "Cadrage fonctionnel — il fait foi : il prime sur le ticket et sur le cadrage technique.",
        "- F1 : Periode par defaut ? → Mois en cours (choix du PO)",
        "- F2 : Redater l'import ? → Oui, au premier jour de l'exercice (choix du PO)",
        "",
        "Cadrage technique — le comment, subordonne au cadrage fonctionnel. Il ne s'en ecarte que par une derogation acceptee par l'humain, signalee comme telle.",
        "- Ou vit le filtre ? → Dans clamp (src/period.js:1)",
        "- Redate-t-on l'import ? → Non (src/import.js:40 fige la date) — derogation a F2 acceptee par l'humain (impossibilite technique)",
      ].join("\n"),
    );
  });
});
