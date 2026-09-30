import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { afterEach, describe, it } from "bun:test";
import { clearTicket } from "../../src/app/clear.ts";
import { drive } from "../../src/app/driver.ts";
import { readLedger, writeLedger } from "../../src/app/ledger.ts";
import { lockFile, runDirectory } from "../../src/app/paths.ts";
import type { Prompter } from "../../src/cli/ask.ts";
import { silentProgress } from "../../src/cli/progress.ts";
import { runSession } from "../../src/cli/session.ts";
import type { Script } from "../kit/agents.ts";
import { codePass, codeRefuse, codeReply, IMPLEMENTATION, memoryReply, merge, proseReply, testsPhase } from "../kit/delivery.ts";
import { functionalAsk, functionalDone, ISSUE, plan, scoutCore, technicalDone } from "../kit/framing.ts";
import { createWorld, type World } from "../kit/world.ts";

let world: World | null = null;
afterEach(async () => {
  await world?.cleanup();
  world = null;
});

const framing = { "functional-grill": [{ reply: functionalAsk }, { reply: functionalDone }], "scope-scout": [{ reply: scoutCore }, { reply: scoutCore }], "technical-grill": [{ reply: technicalDone() }], planner: [{ reply: plan() }] };
const closing = { "memory-planner": [{ reply: memoryReply }], finalizer: [{ reply: proseReply(["fixture-core"]) }] };
const implement = { writes: { "src/period.js": IMPLEMENTATION }, reply: codeReply() };

function scripted(answers: string[]): Prompter & { asked: string[] } {
  const asked: string[] = [];
  return {
    asked,
    async ask(request) {
      asked.push(request.question.split("\n")[0] ?? "");
      return answers.shift() ?? null;
    },
  };
}

const git = (cwd: string, ...args: string[]) => execFileSync("git", args, { cwd, encoding: "utf8" }).trim();

describe("une session redline", () => {
  it("va du ticket a la publication en posant les questions une a une", async () => {
    world = await createWorld({ issues: [ISSUE], script: merge(framing, testsPhase, { developer: [implement], "code-adversary": [{ reply: codePass(["C1"]) }] }, closing) as Script });
    world.ledger("FT-1");
    const prompter = scripted(["Mois en cours", "Approuver"]);
    const outcome = await runSession(world.app, "FT-1", {}, { prompter, progress: silentProgress });

    assert.equal(outcome.status, "done");
    assert.deepEqual(prompter.asked, ["Grill fonctionnel · 1/1 — Periode par defaut", "Revue du plan · 1/1 — Validation du plan"]);
    const ledger = readLedger(world.app.paths, "FT-1");
    assert.equal(ledger?.phase, "done");
    assert.equal(ledger?.active, null);
    assert.deepEqual(ledger?.history.map((entry) => entry.event), ["run ouvert", "plan approuve", "livraison terminee", "publication terminee"]);
    assert.equal(world.gitlab.mergeRequests.length, 1);
    assert.equal(git(world.app.paths.home, "log", "--format=%s", "-1"), "memory: FT-1");
    assert.ok(!existsSync(lockFile(world.app.paths, "FT-1")));
    assert.deepEqual(world.agents.remaining(), {});
  });

  it("refuse de lancer un ticket deja en cours", async () => {
    world = await createWorld({ issues: [ISSUE], script: {} });
    world.ledger("FT-1");
    const other = spawn("sleep", ["30"]);
    mkdirSync(world.app.paths.locks, { recursive: true });
    writeFileSync(lockFile(world.app.paths, "FT-1"), JSON.stringify({ runId: "autre", pid: other.pid, at: "2026-09-30" }));
    await assert.rejects(() => runSession(world!.app, "FT-1", {}, { prompter: scripted([]), progress: silentProgress }), /deja en cours/);
    other.kill();
  });

  it("recupere un run dont le process est mort en tenant son checkpoint", async () => {
    world = await createWorld({ issues: [ISSUE], script: framing as Script });
    const ledger = world.ledger("FT-1");
    const runId = "FT-1/framing/1";
    await world.storage("FT-1").checkpoints.acquire(runId);
    writeLedger(world.app.paths, { ...ledger, active: { runId, pid: 999_999 } });
    writeFileSync(lockFile(world.app.paths, "FT-1"), JSON.stringify({ runId: "mort", pid: 999_999, at: "2026-09-30" }));
    const outcome = await runSession(world.app, "FT-1", {}, { prompter: scripted([]), progress: silentProgress });
    assert.equal(outcome.status, "cancelled");
    assert.equal(world.agents.prompts["functional-grill"]?.length, 1);
  });

  it("reprend une escalade avec un budget neuf et la consigne de l'humain, sans refaire le reste", async () => {
    world = await createWorld({
      issues: [ISSUE],
      script: merge(
        framing,
        testsPhase,
        { developer: [implement, implement, implement, implement], "code-adversary": [1, 2, 3, 4].map(() => ({ reply: codeRefuse(["C1"]) })) },
        { developer: [implement], "code-adversary": [{ reply: codePass(["C1"]) }] },
        closing,
      ) as Script,
    });
    world.ledger("FT-1");
    const escalated = await runSession(world.app, "FT-1", {}, { prompter: scripted(["Mois en cours", "Approuver"]), progress: silentProgress });
    assert.equal(escalated.status, "escalated");
    assert.equal(escalated.status === "escalated" ? escalated.escalation.task : "", "fixture-core.code/adversaire");

    const resumed = await runSession(world.app, "FT-1", { resume: true, fresh: { note: "Garde la signature de clamp" } }, { prompter: scripted([]), progress: silentProgress });
    assert.equal(resumed.status, "done");
    assert.match(world.agents.prompts.developer?.at(-1) ?? "", /Garde la signature de clamp/);
    assert.equal(world.agents.prompts["test-writer"]?.length, 1);
    assert.equal(readLedger(world.app.paths, "FT-1")?.delivery.generation, 2);
    assert.deepEqual(world.agents.remaining(), {});
  });

  it("nettoie l'etat local d'un ticket publie et liste ce qui reste a distance", async () => {
    world = await createWorld({ issues: [ISSUE], script: merge(framing, testsPhase, { developer: [implement], "code-adversary": [{ reply: codePass(["C1"]) }] }, closing) as Script });
    world.ledger("FT-1");
    await runSession(world.app, "FT-1", {}, { prompter: scripted(["Mois en cours", "Approuver"]), progress: silentProgress });

    const dry = await clearTicket(world.app, "FT-1", { force: false, dryRun: true });
    assert.ok(dry.removed.some((entry) => entry.includes("feature/FT-1-filtrer-la-liste-par-periode")));
    assert.ok(existsSync(runDirectory(world.app.paths, "FT-1")));
    assert.ok(dry.remote.some((entry) => entry.startsWith("MR fixture-core")));

    const done = await clearTicket(world.app, "FT-1", { force: false, dryRun: false });
    assert.deepEqual(done.blocked, []);
    assert.ok(done.remote.some((entry) => entry.startsWith("canal Slack")));
    assert.ok(!existsSync(runDirectory(world.app.paths, "FT-1")));
    const core = world.repos.find((repo) => repo.name === "fixture-core")?.path ?? "";
    assert.doesNotMatch(git(core, "branch", "--list"), /FT-1/);
  });

  it("nettoie quand meme un ticket dont la publication ne se relit plus", async () => {
    world = await createWorld({ issues: [ISSUE], script: {} });
    world.ledger("FT-1", { phase: "done", publication: { mergeRequests: "fixture-core" } });

    const done = await clearTicket(world.app, "FT-1", { force: false, dryRun: false });
    assert.ok(done.remote.some((entry) => entry.startsWith("publication illisible")));
    assert.equal(readLedger(world.app.paths, "FT-1"), null);
  });

  it("escalade un checkpoint ecrit par d'autres briefs, et repart proprement avec --fresh", async () => {
    world = await createWorld({ issues: [ISSUE], script: { "functional-grill": [{ reply: functionalAsk }, { reply: functionalAsk }] } as Script });
    world.ledger("FT-1");
    const waiting = await drive(world.app, "FT-1", {}, { version: "briefs-v1" });
    assert.equal(waiting.status, "waiting");
    const stale = await drive(world.app, "FT-1", {}, { version: "briefs-v2" });
    assert.equal(stale.status, "escalated");
    assert.match(stale.status === "escalated" ? stale.escalation.detail : "", /--fresh/);
    const fresh = await drive(world.app, "FT-1", { resume: true, fresh: { note: null } }, { version: "briefs-v2" });
    assert.equal(fresh.status, "waiting");
    assert.equal(readLedger(world.app.paths, "FT-1")?.framing.attempt, 2);
  });
});
