import assert from "node:assert/strict";
import { describe, it } from "bun:test";
import { insightBrief, type InsightLine } from "../../src/domain/insight.ts";

const at = Date.parse("2026-11-19T10:00:00.000Z");
const gate = (task: string, round: number, verdict: "pass" | "feedback", text: string | null): InsightLine => ({
  at: at + round * 1000,
  event: { type: "gate", task, gate: "adversaire", round, verdict, spent: verdict === "pass" ? round - 1 : round, budget: 3, text },
});
const LINES: InsightLine[] = [
  gate("core.tests", 1, "feedback", "tests/lock.test.ts:12 couple au SQL"),
  gate("app.tests", 1, "pass", null),
  gate("core.tests", 2, "feedback", "tests/lock.test.ts:12 toujours"),
  { at: at + 5000, event: { type: "output", task: "core.tests", value: { files: [{ path: "tests/lock.test.ts" }] } } },
  { at: at + 6000, outcome: { status: "escalated", escalation: { kind: "convergence", task: "core.tests/adversaire" } } },
];

describe("le contexte d'une explication", () => {
  it("ne garde des echecs successifs que les refus, avec leur texte", () => {
    const brief = insightBrief(LINES, { question: "failures", task: null });
    assert.match(brief, /VERDICT core\.tests · adversaire · tour 1 · refuse \(1\/3\)\ntests\/lock\.test\.ts:12 couple au SQL/);
    assert.doesNotMatch(brief, /app\.tests/);
    assert.match(brief, /FIN DE SESSION .*convergence/);
  });

  it("restreint les questions sur une tache a cette tache, resultat compris", () => {
    const brief = insightBrief(LINES, { question: "task", task: "core.tests" });
    assert.match(brief, /RESULTAT core\.tests\n/);
    assert.doesNotMatch(brief, /app\.tests/);
    const verdicts = insightBrief(LINES, { question: "verdicts", task: "app.tests" });
    assert.match(verdicts, /app\.tests · adversaire · tour 1 · accepte/);
    assert.doesNotMatch(verdicts, /core\.tests ·/);
  });

  it("coupe les entrees les plus anciennes quand le journal est trop long", () => {
    const many = Array.from({ length: 40 }, (_, index) => gate("core.tests", index + 1, "feedback", `refus ${index + 1} ${"x".repeat(2000)}`));
    const brief = insightBrief(many, { question: "failures", task: null });
    assert.match(brief, /^\(\d+ entree\(s\) plus anciennes coupees\)/);
    assert.match(brief, /refus 40 /);
    assert.doesNotMatch(brief, /refus 1 x/);
  });

  it("dit quand le journal ne contient rien pour la question", () => {
    assert.equal(insightBrief([], { question: "stop", task: null }), "(rien dans le journal pour cette question)");
  });
});
