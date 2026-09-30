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

  it("donne aux agents les tickets lies, parents, sous-taches et cites, sans bloquer sur un illisible", async () => {
    world = await createWorld({
      issues: [
        { ...ISSUE, parent: "FT-100", subtasks: ["FT-2"], links: [{ type: "Blocks", to: "FT-404" }] },
        { key: "FT-100", summary: "Refonte des filtres", issueType: "Epic", description: "Tous les filtres passent a la periode." },
        { key: "FT-2", summary: "Libelle du filtre", issueType: "Sub-task" },
        { key: "FT-3", summary: "Export par periode" },
      ],
      script: { "functional-grill": [{ reply: functionalDone }], "scope-scout": scouts(), "technical-grill": [{ reply: technicalDone() }], planner: [{ reply: plan() }] },
    });
    const issue = world.jira.issues.get(ISSUE.key);
    if (issue) issue.description += `\nVoir aussi ${world.jira.url}/browse/FT-3`;
    const { outcome } = await frame(world, world.ledger("FT-1"), ["Approuver"]);

    assert.deepEqual(outcome?.ticket.related.map((entry) => [entry.key, entry.relation, "unavailable" in entry]), [
      ["FT-100", "parent", false],
      ["FT-2", "sous-tache", false],
      ["FT-404", "blocks", true],
      ["FT-3", "cite dans la description", false],
    ]);
    for (const role of ["functional-grill", "scope-scout", "technical-grill", "planner"] as const) {
      const prompt = world.agents.prompts[role]?.[0] ?? "";
      assert.match(prompt, /### FT-100 — Refonte des filtres \(parent ; Epic, READY TO DEV\)/, role);
      assert.match(prompt, /### FT-404 \(blocks\) — illisible/, role);
      assert.match(prompt, /### FT-3 — Export par periode/, role);
    }
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
