import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { afterEach, describe, it } from "bun:test";
import { parseEscalation } from "../../src/domain/escalation.ts";
import type { Script } from "../kit/agents.ts";
import { appPhase, approved, codePass, codeReply, deliver, IMPLEMENTATION, merge, testsPhase, twoRepoPlan } from "../kit/delivery.ts";
import { ISSUE } from "../kit/framing.ts";
import { createWorld, type World } from "../kit/world.ts";

let world: World | null = null;
afterEach(async () => {
  await world?.cleanup();
  world = null;
});

const git = (cwd: string, ...args: string[]) => execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
const corePhase = { ...testsPhase, developer: [{ writes: { "src/period.js": IMPLEMENTATION }, reply: codeReply() }], "code-adversary": [{ reply: codePass(["C1"]) }] };
const script = merge(corePhase, appPhase) as Script;
const green = { jobs: [{ name: "build", status: "success" }] };
const fastCi = (template: string) => template.replace("ciPipelineSeconds: 1800", "ciPipelineSeconds: 2").replace("ciPollSeconds: 15", "ciPollSeconds: 1");

describe("la publication amont", () => {
  it("publie l'amont par un tag seul, attend son pipeline, puis fait adopter la version a l'aval", async () => {
    world = await createWorld({ issues: [ISSUE], script, settings: fastCi });
    world.gitlab.pipelineVerdicts.set("v1.0.0-FT-1-1", green);
    const { result, outcome } = await deliver(world, world.ledger("FT-1"), approved(world, twoRepoPlan()));
    result.unwrap();

    const [core, app] = outcome ?? [];
    assert.deepEqual(core?.release, { tag: "v1.0.0-FT-1-1", version: "1.0.0-FT-1-1" });
    const coreRepo = world.repos.find((repo) => repo.name === "fixture-core")?.path ?? "";
    assert.match(git(coreRepo, "ls-remote", "--tags", "origin"), /refs\/tags\/v1\.0\.0-FT-1-1/);
    assert.doesNotMatch(git(coreRepo, "ls-remote", "--heads", "origin"), /feature\//);
    assert.equal(app?.commits[0], "build(deps): bump @fixture/core@1.0.0-FT-1-1");
    assert.match(git(app?.directory ?? "", "show", "HEAD:deps.json"), /"@fixture\/core": "1\.0\.0-FT-1-1"/);
    assert.match(world.agents.prompts["test-writer"]?.[1] ?? "", /fixture-app/);
    assert.ok(world.gitlab.pipelinePolls >= 1);
  });

  it("republie sous le numero suivant quand un tag de ce ticket existe deja ailleurs", async () => {
    world = await createWorld({ issues: [ISSUE], script, settings: fastCi });
    const coreRepo = world.repos.find((repo) => repo.name === "fixture-core")?.path ?? "";
    git(coreRepo, "tag", "-a", "v1.0.0-FT-1-1", "-m", "ancienne publication");
    git(coreRepo, "push", "-q", "origin", "refs/tags/v1.0.0-FT-1-1");
    world.gitlab.pipelineVerdicts.set("v1.0.0-FT-1-2", green);
    const { result, outcome } = await deliver(world, world.ledger("FT-1"), approved(world, twoRepoPlan()));
    result.unwrap();
    assert.equal(outcome?.[0]?.release?.tag, "v1.0.0-FT-1-2");
  });

  it("escalade un pipeline qui ne rend rien, garde le tag, et reprend sans republier", async () => {
    world = await createWorld({ issues: [ISSUE], script, settings: fastCi });
    const ledger = world.ledger("FT-1");
    const first = await deliver(world, ledger, approved(world, twoRepoPlan()));
    const escalation = parseEscalation(String(first.result.errors[0]));
    assert.deepEqual([escalation?.kind, escalation?.task], ["environment", "fixture-core.release"]);
    assert.match(escalation?.detail ?? "", /no-pipeline/);
    const coreRepo = world.repos.find((repo) => repo.name === "fixture-core")?.path ?? "";
    assert.match(git(coreRepo, "ls-remote", "--tags", "origin"), /v1\.0\.0-FT-1-1/);
    assert.equal(world.agents.prompts["test-writer"]?.length, 1);
    assert.equal(world.gitlab.mergeRequests.length, 0);

    world.gitlab.pipelineVerdicts.set("v1.0.0-FT-1-1", green);
    const second = await deliver(world, ledger, approved(world, twoRepoPlan()), { resume: true });
    second.result.unwrap();
    assert.equal(second.outcome?.[0]?.release?.tag, "v1.0.0-FT-1-1");
    assert.doesNotMatch(git(coreRepo, "ls-remote", "--tags", "origin"), /FT-1-2/);
    assert.deepEqual(world.agents.remaining(), {});
  });
});
