import assert from "node:assert/strict";
import { afterEach, describe, it } from "bun:test";
import { parseEscalation } from "../../src/domain/escalation.ts";
import { frame, functionalAsk, functionalDone, ISSUE, plan, scoutCore, technicalDone } from "../kit/framing.ts";
import { createWorld, type World } from "../kit/world.ts";

let world: World | null = null;
afterEach(async () => {
  await world?.cleanup();
  world = null;
});

const scouts = (count = 2) => Array.from({ length: count }, () => ({ reply: scoutCore }));

describe("le cadrage", () => {
  it("va du ticket au plan approuve, sans maquette", async () => {
    world = await createWorld({
      issues: [ISSUE],
      script: { "functional-grill": [{ reply: functionalAsk }, { reply: functionalDone }], "scope-scout": scouts(), "technical-grill": [{ reply: technicalDone() }], planner: [{ reply: plan() }] },
    });
    const { outcome, asked } = await frame(world, world.ledger("FT-1"), ["Mois en cours", "Approuver"]);

    assert.equal(outcome?.decision, "approve");
    assert.deepEqual(outcome?.scope.impacted.map((entry) => entry.repo), ["fixture-core"]);
    assert.deepEqual(outcome?.scope.excluded.map((entry) => entry.repo).sort(), ["fixture-app", "fixture-flaky", "fixture-mono"]);
    assert.deepEqual(outcome?.ticket.criteria, [{ id: "AC1", text: "La periode par defaut est le mois en cours" }]);
    assert.deepEqual(outcome?.figma.frames, []);
    assert.match(asked[0] ?? "", /Grill fonctionnel · 1\/1 — Periode par defaut/);
    assert.match(asked[1] ?? "", /Revue du plan[\s\S]*T1 \[ut\] Sans periode/);
    assert.match(world.agents.prompts["functional-grill"]?.[1] ?? "", /Reponse : Mois en cours/);
    assert.deepEqual(world.agents.remaining(), {});
  });

  it("amender le plan ne relance que le planner, avec la note", async () => {
    world = await createWorld({
      issues: [ISSUE],
      script: { "functional-grill": [{ reply: functionalAsk }, { reply: functionalDone }], "scope-scout": scouts(), "technical-grill": [{ reply: technicalDone() }], planner: [{ reply: plan() }, { reply: plan() }] },
    });
    const first = await frame(world, world.ledger("FT-1"), ["Mois en cours", "Amender le plan", "Ajoute un test sur le mois de fevrier"]);
    assert.deepEqual({ decision: first.outcome?.decision, note: first.outcome?.note }, { decision: "amend", note: "Ajoute un test sur le mois de fevrier" });

    const reopened = world.ledger("FT-1", { framing: { attempt: 2, reopen: [{ target: "plan", note: "Ajoute un test sur le mois de fevrier", at: "2026-09-30" }] } });
    const second = await frame(world, reopened, ["Approuver"]);
    assert.equal(second.outcome?.decision, "approve");
    assert.match(world.agents.prompts.planner?.[1] ?? "", /mois de fevrier/);
    assert.equal(world.agents.prompts["functional-grill"]?.length, 2);
    assert.equal(world.agents.prompts["scope-scout"]?.length, 2);
    assert.deepEqual(world.agents.remaining(), {});
  });

  it("rejeter le technique le rouvre seul, et garde le fonctionnel et le perimetre", async () => {
    world = await createWorld({
      issues: [ISSUE],
      script: {
        "functional-grill": [{ reply: functionalAsk }, { reply: functionalDone }],
        "scope-scout": scouts(),
        "technical-grill": [{ reply: technicalDone() }, { reply: technicalDone("On cree une fonction a part") }],
        planner: [{ reply: plan() }, { reply: plan() }],
      },
    });
    await frame(world, world.ledger("FT-1"), ["Mois en cours", "Rejeter : revoir le technique", "Ne touche pas a clamp"]);
    const reopened = world.ledger("FT-1", { framing: { attempt: 2, reopen: [{ target: "technical", note: "Ne touche pas a clamp", at: "2026-09-30" }] } });
    const second = await frame(world, reopened, ["Approuver"]);

    assert.equal(second.outcome?.technical.arbitrages[0]?.answer, "On cree une fonction a part");
    assert.match(world.agents.prompts["technical-grill"]?.[1] ?? "", /Ne touche pas a clamp/);
    assert.equal(world.agents.prompts["functional-grill"]?.length, 2);
    assert.deepEqual(world.agents.remaining(), {});
  });

  it("renvoie un plan qui ne couvre pas les criteres au planner, avec la liste des problemes", async () => {
    world = await createWorld({
      issues: [ISSUE],
      script: {
        "functional-grill": [{ reply: functionalDone }],
        "scope-scout": scouts(),
        "technical-grill": [{ reply: technicalDone() }],
        planner: [{ reply: plan({ tests: [{ id: "T1", criterion: "Un test de composant.", kind: "ct", covers: [] }] }) }, { reply: plan() }],
      },
    });
    const { outcome } = await frame(world, world.ledger("FT-1"), ["Approuver"]);
    assert.equal(outcome?.decision, "approve");
    const retry = world.agents.prompts.planner?.[1] ?? "";
    assert.match(retry, /ne declare pas de commande ct/);
    assert.match(retry, /AC1/);
  });

  it("fait corriger une preuve qui ne tient pas, puis la retient", async () => {
    const shaky = (prompt: string) =>
      prompt.includes("ne tiennent pas") || !prompt.includes("fixture-core (level 1")
        ? scoutCore(prompt)
        : { impacted: true, area: "periode", evidence: ["src/nope.js:3 — invente"], reason: "?", contradictions: [] };
    world = await createWorld({
      issues: [ISSUE],
      script: { "functional-grill": [{ reply: functionalDone }], "scope-scout": [{ reply: shaky }, { reply: shaky }, { reply: shaky }], "technical-grill": [{ reply: technicalDone() }], planner: [{ reply: plan() }] },
    });
    const { outcome } = await frame(world, world.ledger("FT-1"), ["Approuver"]);
    assert.deepEqual(outcome?.scope.impacted[0]?.evidence, ["src/period.js:1 — clamp porte la periode"]);
    assert.ok(world.agents.prompts["scope-scout"]?.some((prompt) => prompt.includes("src/nope.js n'existe pas")));
  });

  it("escalade quand aucun repo ne ressort", async () => {
    world = await createWorld({
      issues: [ISSUE],
      script: { "functional-grill": [{ reply: functionalDone }], "scope-scout": scouts().map(() => ({ reply: { impacted: false, area: "", evidence: [], reason: "non", contradictions: [] } })) },
    });
    const { result } = await frame(world, world.ledger("FT-1"), []);
    assert.equal(parseEscalation(String(result.errors[0]))?.kind, "arbitrage");
  });

  it("reprend une interview interrompue sans reposer la question ni rappeler l'agent", async () => {
    world = await createWorld({
      issues: [ISSUE],
      script: { "functional-grill": [{ reply: functionalAsk }, { reply: functionalDone }], "scope-scout": scouts(), "technical-grill": [{ reply: technicalDone() }], planner: [{ reply: plan() }] },
    });
    const ledger = world.ledger("FT-1");
    const interrupted = await frame(world, ledger, []);
    assert.equal(interrupted.result.status, "waiting-input");
    const resumed = await frame(world, ledger, ["Mois en cours", "Approuver"]);
    assert.equal(resumed.outcome?.decision, "approve");
    assert.equal(world.agents.prompts["functional-grill"]?.length, 2);
  });
});
