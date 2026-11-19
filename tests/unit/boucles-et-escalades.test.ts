import assert from "node:assert/strict";
import { describe, it } from "bun:test";
import { escalationFooter } from "../../src/cli/report.ts";
import { earlierEscalations } from "../../src/domain/escalation.ts";
import { invocation } from "../../src/domain/invocation.ts";

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
