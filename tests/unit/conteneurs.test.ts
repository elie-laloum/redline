import assert from "node:assert/strict";
import { chmodSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, describe, it } from "bun:test";
import { inspectImage } from "../../src/adapters/container-runtime.ts";
import { temporaryDirectory } from "../helpers.ts";

const directory = temporaryDirectory();
afterAll(() => directory.cleanup());

function fakeCli(name: string, script: string): string {
  const path = join(directory.path, name);
  writeFileSync(path, `#!/bin/sh\n${script}\n`);
  chmodSync(path, 0o755);
  return path;
}

describe("l'image des agents", () => {
  it("est presente quand le runtime l'inspecte", async () => {
    assert.deepEqual(await inspectImage(directory.path, fakeCli("ok", "exit 0"), "redline-agent:1"), { state: "present" });
  });

  it("est absente quand le daemon dit qu'elle n'existe pas", async () => {
    const cli = fakeCli("absente", 'echo "Error response from daemon: No such image: redline-agent:1" >&2; exit 1');
    assert.deepEqual(await inspectImage(directory.path, cli, "redline-agent:1"), { state: "absent" });
  });

  it("garde l'erreur du daemon quand ce n'est pas l'image qui manque", async () => {
    const cli = fakeCli("daemon", 'echo "Cannot connect to the Docker daemon at unix:///var/run/docker.sock. Is the docker daemon running?" >&2; exit 1');
    const state = await inspectImage(directory.path, cli, "redline-agent:1");
    assert.equal(state.state, "error");
    assert.match(state.state === "error" ? state.detail : "", /Cannot connect to the Docker daemon/);
  });

  it("refuse un nom d'image qui sortirait de la commande", async () => {
    const state = await inspectImage(directory.path, fakeCli("jamais", "exit 0"), "x; rm -rf /");
    assert.equal(state.state, "error");
  });
});
