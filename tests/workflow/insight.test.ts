import assert from "node:assert/strict";
import { afterEach, describe, it } from "bun:test";
import { appendJournal } from "../../src/app/event-journal.ts";
import { explainRun } from "../../src/app/insight.ts";
import type { Script } from "../kit/agents.ts";
import { ISSUE } from "../kit/framing.ts";
import { createWorld, type World } from "../kit/world.ts";

let world: World | null = null;
afterEach(async () => {
  await world?.cleanup();
  world = null;
});

const ANSWER = {
  findings: [{ headline: "L'adversaire des tests refuse le meme fichier depuis deux tours.", detail: "tests/lock.test.ts:12 est cite aux tours 1 et 2." }],
  conclusion: "Supprime tests/lock.test.ts, puis relance avec redline resume FT-1 --fresh.",
};

describe("l'explication a la demande", () => {
  it("pose la question a l'agent avec le journal du run, et rend ses constats", async () => {
    world = await createWorld({ issues: [ISSUE], script: { "run-explainer": [{ reply: ANSWER }] } as Script });
    world.ledger("FT-1");
    appendJournal(world.app.paths, "FT-1", [
      { at: Date.parse("2026-11-19T10:00:00.000Z"), event: { type: "gate", task: "core.tests", gate: "adversaire", round: 1, verdict: "feedback", spent: 1, budget: 3, text: "tests/lock.test.ts:12 couple au SQL" } },
    ]);

    const insight = await explainRun(world.app, "FT-1", { question: "failures", task: null });

    assert.deepEqual(insight, ANSWER);
    const prompt = world.agents.prompts["run-explainer"]?.[0] ?? "";
    assert.match(prompt, /## La question\n\nResume les echecs successifs/);
    assert.match(prompt, /VERDICT core\.tests · adversaire · tour 1 · refuse \(1\/3\)\ntests\/lock\.test\.ts:12 couple au SQL/);
  });
});
