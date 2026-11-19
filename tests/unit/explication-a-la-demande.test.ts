import assert from "node:assert/strict";
import type { KeyEvent } from "@opentui/core";
import { createTestRenderer } from "@opentui/core/testing";
import { describe, it } from "bun:test";
import { insightLines, MENU, pressInsight } from "../../src/cli/dashboard/insight.ts";
import { createBoard } from "../../src/cli/tui/board.ts";
import { insightBrief, type InsightLine, type InsightRequest } from "../../src/domain/insight.ts";

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

describe("le panneau des questions a l'IA", () => {
  const INSIGHT = {
    findings: [
      { headline: "L'adversaire refuse le meme fichier.", detail: "Tours 2 a 4 : tests/lock.test.ts:12." },
      { headline: "Le budget est epuise.", detail: "4 refus pour 3 tours." },
    ],
    conclusion: "Supprime le fichier, puis relance avec --fresh.",
  };

  it("ne pose une question sur une tache que si une tache est choisie", () => {
    const onVerdicts = { mode: "menu" as const, cursor: 2, hint: null };
    const refused = pressInsight(onVerdicts, "return", null);
    assert.equal(refused.ask, null);
    assert.deepEqual(refused.panel, { ...onVerdicts, hint: "Choisis d'abord une tache dans la liste." });
    const asked = pressInsight(onVerdicts, "return", "core.tests");
    assert.deepEqual(asked.ask, { request: { question: "verdicts", task: "core.tests" }, fresh: false });
    const stop = pressInsight(MENU, "return", "core.tests");
    assert.deepEqual(stop.ask, { request: { question: "stop", task: null }, fresh: false });
  });

  it("deplie et replie un constat, et repose la question avec r", () => {
    const answer = { mode: "answer" as const, request: { question: "failures" as const, task: null }, insight: INSIGHT, cursor: 0, open: [] };
    const second = pressInsight(answer, "down", null).panel;
    const opened = second && pressInsight(second, "right", null).panel;
    assert.deepEqual(opened && "open" in opened ? opened.open : null, [1]);
    const closed = opened && pressInsight(opened, "left", null).panel;
    assert.deepEqual(closed && "open" in closed ? closed.open : null, []);
    assert.deepEqual(pressInsight(answer, "r", null).ask, { request: answer.request, fresh: true });
    assert.deepEqual(pressInsight(answer, "escape", null).panel, { mode: "menu", cursor: 1, hint: null });
    assert.equal(pressInsight(MENU, "escape", null).panel, null);
  });

  it("montre les constats repliés, le detail de ceux qui sont deplies, et la conclusion", () => {
    const lines = insightLines({ mode: "answer", request: { question: "verdicts", task: "core.tests" }, insight: INSIGHT, cursor: 1, open: [1] }, "core.tests", (task) => `${task} — tests`).map((entry) => entry.text);
    assert.equal(lines[0], "Explique les verdicts de cette tache — core.tests — tests");
    assert.ok(lines.includes("  ▸ L'adversaire refuse le meme fichier."));
    assert.ok(lines.includes("› ▾ Le budget est epuise."));
    assert.ok(lines.includes("    4 refus pour 3 tours."));
    assert.ok(!lines.includes("    Tours 2 a 4 : tests/lock.test.ts:12."));
    assert.ok(lines.includes("Supprime le fichier, puis relance avec --fresh."));
  });
});

describe("le tableau de bord, quand on interroge l'IA", () => {
  const key = (name: string) => ({ name, ctrl: false, shift: false, meta: false, preventDefault() {} }) as unknown as KeyEvent;
  const FIRST = { selected: null, follow: true, focus: "tasks" as const, view: "inspector" as const, changes: null, layout: "dashboard" as const, notice: null, ended: false, watching: null, insight: null };
  const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

  it("ouvre le menu avec e, n'appelle l'agent qu'a Entree, et reprend une reponse deja obtenue", async () => {
    const { renderer, renderOnce, captureCharFrame } = await createTestRenderer({ width: 140, height: 40 });
    const asked: InsightRequest[] = [];
    const answer = { findings: [{ headline: "Budget epuise.", detail: "4 refus." }], conclusion: "Relance avec --fresh." };
    const board = createBoard(renderer, { key: "FT-1", title: "Titre" }, FIRST, async (request) => {
      asked.push(request);
      return answer;
    });
    const mode = () => board.screen.insight?.mode;
    try {
      board.navigate(key("e"));
      assert.deepEqual([board.screen.view, board.screen.focus, board.screen.insight?.mode, board.asking], ["explain", "inspector", "menu", true]);
      await new Promise((resolve) => setTimeout(resolve, 80));
      await renderOnce();
      const frame = captureCharFrame();
      assert.match(frame, /Explication · IA/);
      assert.match(frame, /› Pourquoi le run s'est arrete/);
      board.navigate(key("down"));
      assert.equal(asked.length, 0);
      board.navigate(key("return"));
      assert.equal(mode(), "asking");
      await settle();
      assert.equal(mode(), "answer");
      board.navigate(key("escape"));
      board.navigate(key("return"));
      assert.equal(mode(), "answer");
      assert.deepEqual(asked, [{ question: "failures", task: null }]);
      board.navigate(key("r"));
      await settle();
      assert.equal(asked.length, 2);
    } finally {
      board.dispose();
      renderer.destroy();
    }
  });

  it("dit pourquoi l'agent n'a pas repondu", async () => {
    const { renderer } = await createTestRenderer({ width: 120, height: 40 });
    const board = createBoard(renderer, { key: "FT-1", title: "Titre" }, FIRST, async () => {
      throw new Error("image des agents absente");
    });
    try {
      board.navigate(key("e"));
      board.navigate(key("return"));
      await settle();
      const panel = board.screen.insight;
      const text = panel !== null && panel.mode === "failed" ? panel.text : "";
      assert.match(text, /image des agents absente/);
    } finally {
      board.dispose();
      renderer.destroy();
    }
  });
});
