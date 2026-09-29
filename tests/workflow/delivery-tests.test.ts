import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { afterEach, describe, it } from "bun:test";
import { parseEscalation } from "../../src/domain/escalation.ts";
import { allPass, approved, deliver, FAILING_TEST, goodRed, PASSING_TEST, testsReply } from "../kit/delivery.ts";
import { ISSUE } from "../kit/framing.ts";
import { createWorld, type World } from "../kit/world.ts";

let world: World | null = null;
afterEach(async () => {
  await world?.cleanup();
  world = null;
});

const git = (cwd: string, ...args: string[]) => execFileSync("git", args, { cwd, encoding: "utf8" }).trim();

describe("la convergence des tests", () => {
  it("annule ce qui sort de la zone, refuse un test deja vert, et retient le bon rouge", async () => {
    world = await createWorld({
      issues: [ISSUE],
      script: {
        "test-writer": [
          { writes: { "tests/period-default.test.js": PASSING_TEST, "src/period.js": "export const hack = 1;\n" }, reply: testsReply() },
          { writes: { "tests/period-default.test.js": PASSING_TEST }, reply: testsReply() },
          { writes: { "tests/period-default.test.js": FAILING_TEST }, reply: testsReply() },
        ],
        "test-adversary": [{ reply: allPass(["T1"]) }, { reply: allPass(["T1"]) }],
        "red-checker": [{ reply: goodRed }],
      },
    });
    const { result, outcome } = await deliver(world, world.ledger("FT-1"), approved(world));
    result.unwrap();

    const core = outcome?.[0];
    assert.equal(core?.branch, "feature/FT-1-filtrer-la-liste-par-periode");
    assert.equal(git(core?.directory ?? "", "diff", "--name-only", `${core?.base}..HEAD`), "tests/period-default.test.js");
    assert.equal(git(core?.directory ?? "", "show", "HEAD:src/period.js"), git(core?.directory ?? "", "show", `${core?.base}:src/period.js`));
    assert.match(world.agents.prompts["test-writer"]?.[1] ?? "", /src\/period\.js/);
    assert.match(world.agents.prompts["test-writer"]?.[2] ?? "", /passent deja/);
    assert.match(world.agents.prompts["red-checker"]?.[0] ?? "", /2026-09/);
    assert.deepEqual(world.agents.remaining(), {});
    assert.ok(core?.commits.every((subject) => subject.startsWith("test(period)")));
  });

  it("escalade quand le registre ne permet pas de tester une ligne du plan", async () => {
    world = await createWorld({
      issues: [ISSUE],
      script: { "test-writer": [{ reply: { files: [], commit: { type: "test", subject: "nothing" }, uncoverable: [{ id: "T1", reason: "il faudrait un test e2e" }] } }] },
    });
    const { result } = await deliver(world, world.ledger("FT-1"), approved(world));
    const escalation = parseEscalation(String(result.errors[0]));
    assert.equal(escalation?.kind, "arbitrage");
    assert.match(escalation?.detail ?? "", /e2e/);
  });
});

