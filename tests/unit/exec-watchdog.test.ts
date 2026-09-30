import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { describe, it } from "bun:test";
import { run, stopReason } from "../../src/adapters/exec.ts";
import { PROJECT_ROOT } from "../helpers.ts";

const at = (timeoutMs: number, silenceMs: number) => ({ cwd: PROJECT_ROOT, timeoutMs, silenceMs });

describe("le chien de garde de silence", () => {
  it("abandonne une commande vivante mais muette, bien avant le plafond", async () => {
    const started = Date.now();
    const result = await run("sleep 30", at(30_000, 1_000));
    assert.equal(result.stoppedBy, "silence");
    assert.equal(result.exitCode, 124);
    assert.ok(Date.now() - started < 10_000);
  });

  it("laisse tourner une commande lente tant qu'elle ecrit", async () => {
    const result = await run("for i in 1 2 3 4 5 6 7 8; do echo tick; sleep 0.2; done", at(30_000, 1_000));
    assert.equal(result.stoppedBy, "exit");
    assert.equal(result.exitCode, 0);
  });

  it("distingue le plafond du silence dans ce qu'il rend a lire", async () => {
    const silent = await run("sleep 10", at(10_000, 800));
    const capped = await run("while true; do echo tick; sleep 0.1; done", at(1_500, 60_000));
    assert.match(stopReason(silent) ?? "", /sans la moindre sortie/);
    assert.match(stopReason(capped) ?? "", /plafond/);
    assert.equal(capped.stoppedBy, "timeout");
  });

  it("ne dit rien d'une commande qui a rendu son verdict elle-meme", async () => {
    const ok = await run("echo fini", at(10_000, 5_000));
    assert.equal(ok.stoppedBy, "exit");
    assert.equal(stopReason(ok), null);
  });

  it("rend le plus long silence traverse, pas seulement le dernier", async () => {
    const result = await run("echo debut; sleep 1.2; echo milieu; sleep 0.2; echo fin", at(20_000, 10_000));
    assert.ok(result.maxSilentMs >= 1_000);
    assert.ok(result.silentForMs < result.maxSilentMs);
  });

  it("bat la mesure pendant qu'une commande tourne", async () => {
    const beats: number[] = [];
    await run("for i in 1 2 3 4 5 6; do echo tick; sleep 0.2; done", { ...at(20_000, 2_000), onProgress: (elapsed) => beats.push(elapsed) });
    assert.ok(beats.length > 0);
  });

  it("s'arrete quand on l'annule", async () => {
    const controller = new AbortController();
    setTimeout(() => controller.abort(), 300);
    const result = await run("sleep 30", { ...at(30_000, 20_000), signal: controller.signal });
    assert.equal(result.stoppedBy, "abort");
    assert.match(stopReason(result) ?? "", /interrompue/);
  });
});

describe("le chien de garde abat le groupe de processus", () => {
  it("rend la main meme quand un petit-fils survit et tient les tubes", async () => {
    const started = Date.now();
    const result = await run('node -e "setTimeout(()=>{}, 600000)" & sleep 600', at(60_000, 3_000));
    assert.equal(result.stoppedBy, "silence");
    assert.ok(Date.now() - started < 20_000);
  });

  it("ne laisse pas le petit-fils derriere lui", async () => {
    const marker = `orphelin-${process.pid}-${Date.now()}`;
    await run(`node -e "process.title='${marker}'; setTimeout(()=>{}, 600000)" & sleep 600`, at(60_000, 3_000));
    await new Promise((resolve) => setTimeout(resolve, 3_000));
    assert.equal(spawnSync("pgrep", ["-f", marker], { encoding: "utf8" }).stdout.trim(), "");
  });
});
