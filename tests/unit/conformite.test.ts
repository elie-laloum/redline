import assert from "node:assert/strict";
import { describe, it } from "bun:test";
import { outcomeNotice } from "../../src/cli/report.ts";
import { bindingDecisions, type ConformityReport, renderGap } from "../../src/domain/conformity.ts";
import type { Publication } from "../../src/phases/closing/workflow.ts";

const publication = (conformity: readonly ConformityReport[]): Publication => ({
  memory: { operations: [], commit: null },
  mergeRequests: [{ repo: "fixture-core", project: "g/core", iid: 1, url: "https://forge/1" }],
  slack: null,
  jira: { transition: "VALIDATION", commented: true, edits: { applied: 0, missed: [] } },
  openPoints: [],
  conformity,
});

describe("la conformite au cadrage", () => {
  it("juge chaque arbitrage fonctionnel, ou la derogation acceptee qui le remplace", () => {
    const functional = [
      { question: "Periode par defaut ?", answer: "Mois en cours", why: "humain" },
      { question: "Export ?", answer: "CSV", why: "humain" },
    ];
    const technical = [
      { question: "Ou vit le filtre ?", answer: "Dans clamp", why: "src/period.js" },
      { question: "Quel format ?", answer: "XLSX", why: "le CSV casse les accents", overrides: { functional: "F2" } },
    ];
    const decisions = bindingDecisions(functional, technical);
    assert.deepEqual(decisions, [
      { id: "F1", text: "Periode par defaut ? → Mois en cours (humain)" },
      { id: "F2", text: "Export ? → CSV (humain) — remplace par la derogation acceptee : Quel format ? → XLSX (le CSV casse les accents)" },
    ]);
  });

  it("decrit un ecart par ce qui differe, avec sa preuve quand il en a une", () => {
    assert.equal(renderGap({ id: "F1", text: "Periode par defaut ? → Mois en cours", evidence: "src/period.js:2", comment: "rend le mois precedent" }), "F1 Periode par defaut ? → Mois en cours : rend le mois precedent (src/period.js:2)");
    assert.equal(renderGap({ id: "C2", text: "Les appelants ne changent pas.", evidence: " ", comment: "le panneau n'est pas migre" }), "C2 Les appelants ne changent pas. : le panneau n'est pas migre");
  });

  it("fait annoncer les ecarts en fin de run, sans retenir la publication", () => {
    const gap = { id: "F1", text: "Periode par defaut ? → Mois en cours", evidence: "src/period.js:2", comment: "rend le mois precedent" };
    const notice = outcomeNotice("FT-1", { status: "done", publication: publication([{ repo: "fixture-core", gaps: [gap] }]) });
    assert.deepEqual(notice, { tone: "warning", text: "FT-1 publie : 1 MR, 1 ecart(s) au cadrage." });
    const clean = outcomeNotice("FT-1", { status: "done", publication: publication([{ repo: "fixture-core", gaps: [] }]) });
    assert.deepEqual(clean, { tone: "success", text: "FT-1 publie : 1 MR." });
  });
});
