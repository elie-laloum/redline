import assert from "node:assert/strict";
import { describe, it } from "bun:test";
import { describeOutput, type OutputLine } from "../../src/cli/dashboard/outputs.ts";

const texts = (lines: OutputLine[]) => lines.map((line) => `${" ".repeat(line.indent)}${line.text}`);

describe("ce que montre l'inspecteur d'une etape finie", () => {
  it("met en forme le ticket lu, ses criteres et ses tickets lies", () => {
    const lines = describeOutput("ticket", {
      key: "FT-1",
      issueType: "Story",
      status: "A faire",
      title: "Filtrer la liste",
      url: "https://jira/browse/FT-1",
      criteria: [{ id: "AC1", text: "La periode par defaut est le mois en cours" }],
      related: [{ key: "FT-2", relation: "parent", title: "Epic periode" }, { key: "FT-3", relation: "lien", unavailable: "introuvable" }],
    });
    assert.deepEqual(texts(lines), [
      "FT-1 · Story · A faire",
      "Filtrer la liste",
      "https://jira/browse/FT-1",
      "",
      "Criteres",
      "  AC1 La periode par defaut est le mois en cours",
      "",
      "Tickets lies",
      "  FT-2 (parent) — Epic periode",
      "  FT-3 (lien) — introuvable",
    ]);
    assert.equal(lines.at(-1)?.tone, "warning");
  });

  it("montre les arbitrages d'un grill, question, reponse et raison", () => {
    const lines = describeOutput("functional", { output: { arbitrages: [{ question: "Periode par defaut ?", answer: "Mois en cours", why: "choix de l'humain" }], contradictions: [] }, transcript: [{}] });
    assert.deepEqual(texts(lines), ["• Periode par defaut ?", "  → Mois en cours", "  choix de l'humain", "1 echange(s) avec toi"]);
  });

  it("montre le perimetre, preuves comprises", () => {
    const lines = describeOutput("scope", { scope: { impacted: [{ repo: "core", level: 1, area: "periode", evidence: ["src/period.js:1"] }], excluded: [{ repo: "app", reason: "rien ici" }] }, contradictions: [] });
    assert.deepEqual(texts(lines), ["", "Impactes", "  core (niveau 1) — periode", "    src/period.js:1", "", "Ecartes", "  app : rien ici"]);
  });

  it("montre le plan depot par depot, et le tour ou il a converge", () => {
    const lines = describeOutput("plan", {
      candidate: { summary: "On etend clamp.", repos: [{ repo: "core", type: "feature", why: "la periode vit ici", changes: ["clamp rend le mois"], tests: [{ id: "T1", kind: "ut", criterion: "sans periode" }], code: [{ id: "C1", criterion: "appelants inchanges" }] }], openPoints: [] },
      carry: { round: 2 },
    });
    assert.deepEqual(texts(lines), ["On etend clamp.", "", "1. core (feature) — la periode vit ici", "  - clamp rend le mois", "  T1 [ut] sans periode", "  C1 appelants inchanges", "converge au tour 2"]);
  });

  it("reconnait les etapes d'un depot a leur suffixe, lots de code compris", () => {
    assert.deepEqual(texts(describeOutput("core.tests", { candidate: { files: [{ path: "tests/p.test.js", tests: ["T1", "T2"] }], reverted: [], head: "0123456789" }, carry: { round: 1 } })), ["tests/p.test.js  T1, T2", "tete 01234567"]);
    assert.deepEqual(texts(describeOutput("core.code-2", { head: "abcdef1234", reverted: [], appeals: [{ kind: "test-conteste", test: "T2", reason: "le test fige la date" }], contradictions: [] })), ["tete abcdef12", "", "Recours", "  test-conteste T2 : le test fige la date"]);
    assert.deepEqual(texts(describeOutput("core.summary", { branch: "feature/FT-1", baseBranch: "main", commits: ["feat: x"], release: null, contradictions: [] })), ["branche feature/FT-1 → main", "", "Commits", "  feat: x"]);
  });

  it("montre les listes que passent le push et les merge requests", () => {
    assert.deepEqual(texts(describeOutput("push-branches", ["feature/FT-1"])), ["feature/FT-1 pousse"]);
    assert.deepEqual(texts(describeOutput("merge-requests", [{ repo: "core", url: "https://gitlab/mr/1" }])), ["core — https://gitlab/mr/1"]);
  });

  it("retombe sur du YAML pour une etape qu'il ne connait pas, et ne montre rien sans resultat", () => {
    assert.deepEqual(texts(describeOutput("inconnue", { a: 1, b: ["x"] })), ["a: 1", "b:", "  - x"]);
    assert.deepEqual(describeOutput("ticket", null), []);
  });
});
