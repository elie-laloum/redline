import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { afterEach, describe, it } from "bun:test";
import type { Plan } from "../../src/domain/plan.ts";
import { parseEscalation } from "../../src/domain/escalation.ts";
import { approved, codePass, codeRefuse, codeReply, deliver, IMPLEMENTATION, testsPhase } from "../kit/delivery.ts";
import { ISSUE, plan } from "../kit/framing.ts";
import { createWorld, type World } from "../kit/world.ts";

let world: World | null = null;
afterEach(async () => {
  await world?.cleanup();
  world = null;
});

const git = (cwd: string, ...args: string[]) => execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
const implement = { writes: { "src/period.js": IMPLEMENTATION }, reply: codeReply() };

describe("la convergence du code", () => {
  it("livre les tests puis le code, verifies par la machine et par l'adversaire", async () => {
    world = await createWorld({ issues: [ISSUE], script: { ...testsPhase, developer: [implement], "code-adversary": [{ reply: codePass(["C1"]) }] } });
    const { result, outcome } = await deliver(world, world.ledger("FT-1"), approved(world));
    result.unwrap();
    assert.deepEqual(outcome?.[0]?.commits, ["test(period): cover the default period", "feat(period): default to the current month"]);
    assert.match(world.agents.prompts.developer?.[0] ?? "", /C1 Les appelants de clamp ne changent pas/);
    assert.match(world.agents.prompts["code-adversary"]?.[0] ?? "", /src\/period\.js/);
    assert.deepEqual(world.agents.remaining(), {});
  });

  it("escalade quand l'adversaire refuse au-dela de son budget, sans rien publier", async () => {
    world = await createWorld({
      issues: [ISSUE],
      script: { ...testsPhase, developer: Array.from({ length: 4 }, () => implement), "code-adversary": Array.from({ length: 4 }, () => ({ reply: codeRefuse(["C1"]) })) },
    });
    const { result } = await deliver(world, world.ledger("FT-1"), approved(world));
    const escalation = parseEscalation(String(result.errors[0]));
    assert.deepEqual([escalation?.kind, escalation?.task], ["convergence", "fixture-core.code/adversaire"]);
    assert.equal(world.agents.prompts["code-adversary"]?.length, 4);
    assert.match(world.agents.prompts.developer?.[1] ?? "", /le mois est fige/);
    assert.equal(world.gitlab.mergeRequests.length, 0);
    assert.equal(world.slack.channels.length, 0);
  });

  it("escalade le meme test conteste deux fois", async () => {
    const dispute = { kind: "test-conteste", test: "T1", reason: "l'assertion me semble inversee" };
    world = await createWorld({
      issues: [ISSUE],
      script: {
        ...testsPhase,
        developer: [{ writes: { "src/period.js": IMPLEMENTATION }, reply: codeReply([dispute]) }, { reply: codeReply([dispute]) }],
        "appeal-arbiter": [{ reply: { decision: "refuse", reason: "le plan dit mois en cours", commit: null } }],
      },
    });
    const { result } = await deliver(world, world.ledger("FT-1"), approved(world));
    const escalation = parseEscalation(String(result.errors[0]));
    assert.equal(escalation?.kind, "arbitrage");
    assert.match(escalation?.detail ?? "", /T1 conteste 2 fois/);
    assert.match(world.agents.prompts.developer?.[1] ?? "", /T1 — refuse : le plan dit mois en cours/);
    assert.deepEqual(world.agents.remaining(), {});
  });

  it("reprend au lot interrompu sans refaire ce qui est fini", async () => {
    const twoLines = { ...plan(), repos: [{ ...plan().repos[0], code: [{ id: "C1", criterion: "Les appelants ne changent pas." }, { id: "C2", criterion: "Le mois vient de l'horloge." }] }] } as Plan;
    const controller = new AbortController();
    world = await createWorld({
      issues: [ISSUE],
      settings: (template) => template.replace("developerBatchLines: 4", "developerBatchLines: 1"),
      script: {
        ...testsPhase,
        developer: [
          implement,
          {
            reply: () => {
              controller.abort();
              return codeReply();
            },
          },
          { reply: codeReply() },
        ],
        "code-adversary": [{ reply: codePass(["C1", "C2"]) }],
      },
    });
    const ledger = world.ledger("FT-1");
    const first = await deliver(world, ledger, approved(world, twoLines), { signal: controller.signal });
    assert.equal(first.result.status, "cancelled");
    const second = await deliver(world, ledger, approved(world, twoLines), { resume: true });
    second.result.unwrap();
    assert.equal(world.agents.prompts["test-writer"]?.length, 1);
    assert.equal(world.agents.prompts.developer?.length, 3);
    assert.match(world.agents.prompts.developer?.[2] ?? "", /C2 Le mois vient de l'horloge/);
    assert.equal(git(second.outcome?.[0]?.directory ?? "", "log", "-1", "--format=%s"), "feat(period): default to the current month");
  });
});
