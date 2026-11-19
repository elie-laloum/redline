import assert from "node:assert/strict";
import { describe, it } from "bun:test";
import { reopenAfterEscalation } from "../../src/app/driver.ts";
import { newLedger } from "../../src/app/ledger.ts";
import { escalationFooter } from "../../src/cli/report.ts";
import { earlierEscalations } from "../../src/domain/escalation.ts";
import { invocation } from "../../src/domain/invocation.ts";
import { ruledLines, uncoverableDetail, uncoverableLines } from "../../src/domain/rulings.ts";
import { exampleSettings } from "../helpers.ts";

describe("les commandes que redline suggere", () => {
  it("nomment redline une fois installe, et bun redline depuis un clone", () => {
    assert.equal(invocation({}), "redline");
    assert.equal(invocation({ npm_lifecycle_event: "redline" }), "bun redline");
    assert.equal(invocation({ npm_lifecycle_event: "test" }), "redline");
  });
});

describe("le pied d'une escalade", () => {
  const history = [
    { event: "run ouvert" },
    { event: "escalade arbitrage sur core.tests" },
    { event: "reprise de la livraison avec un budget neuf" },
    { event: "escalade convergence sur app.code/adversaire" },
    { event: "escalade arbitrage sur core.tests" },
    { event: "escalade convergence sur core.tests/adversaire" },
  ];

  it("compte les escalades precedentes de la meme tache, gate comprise", () => {
    assert.deepEqual(earlierEscalations(history, "core.tests/adversaire"), ["arbitrage", "arbitrage"]);
    assert.deepEqual(earlierEscalations(history.slice(0, 2), "core.tests"), []);
  });

  it("dit le rang de l'escalade, propose la reprise a la main a partir de la troisieme, et nomme le journal", () => {
    const escalation = { kind: "convergence" as const, task: "core.tests/adversaire", detail: "budget epuise", at: "2026-11-19" };
    const footer = escalationFooter("FT-1", { status: "escalated", escalation, earlier: ["arbitrage", "arbitrage"], journal: "/home/.redline/runs/FT-1/events.jsonl" });
    assert.match(footer, /^3e escalade sur core\.tests — les precedentes : arbitrage, arbitrage\.\n/);
    assert.match(footer, /reprendre la branche a la main/);
    assert.match(footer, /Journal complet, verdicts non tronques : \/home\/\.redline\/runs\/FT-1\/events\.jsonl$/);

    const first = escalationFooter("FT-1", { status: "escalated", escalation });
    assert.doesNotMatch(first, /escalade sur|a la main|Journal/);
  });
});

describe("les arbitrages rendus sur des lignes non couvrables", () => {
  const lines = [{ id: "T15", reason: "PGlite ne sert qu'une connexion" }];

  it("se relisent depuis le detail de l'escalade qui les a declares", () => {
    assert.deepEqual(uncoverableLines(uncoverableDetail(lines)), lines);
    assert.deepEqual(uncoverableLines("budget de 3 tour(s) epuise"), []);
  });

  it("sont consignes quand l'humain reprend l'escalade avec une note, et seulement alors", () => {
    const base = newLedger({ key: "FT-1", squad: "FT", title: "Titre", url: "https://jira/FT-1", notes: null, figmaOverrides: [], budgets: exampleSettings().budgets });
    const escalated = { ...base, phase: "escalated" as const, resumePhase: "delivery" as const, escalation: { kind: "arbitrage" as const, task: "core.tests", detail: uncoverableDetail(lines), at: "2026-11-19" } };

    const ruled = reopenAfterEscalation(escalated, { note: "Le verrou se relit en revue." });
    assert.deepEqual(ruled.delivery.rulings.map((entry) => [entry.task, entry.lines.map((line) => line.id), entry.ruling]), [["core.tests", ["T15"], "Le verrou se relit en revue."]]);
    assert.deepEqual([...ruledLines(ruled.delivery.rulings, "core.tests")], ["T15"]);
    assert.deepEqual([...ruledLines(ruled.delivery.rulings, "app.tests")], []);

    assert.deepEqual(reopenAfterEscalation(escalated, { note: null }).delivery.rulings, []);
    const convergence = { ...escalated, escalation: { ...escalated.escalation, kind: "convergence" as const, task: "core.tests/adversaire" } };
    assert.deepEqual(reopenAfterEscalation(convergence, { note: "Allege l'assertion." }).delivery.rulings, []);
  });
});
