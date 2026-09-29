import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { afterAll, describe, it } from "bun:test";
import { createCheckRunner } from "../../src/adapters/checks.ts";
import { run } from "../../src/adapters/exec.ts";
import { findRepo } from "../../src/domain/config.ts";
import { focusOn } from "../../src/domain/output.ts";
import { renderTargeting } from "../../src/domain/targeting.ts";
import { PROJECT_ROOT, registryFrom, registryYaml, repoYaml, temporaryDirectory } from "../helpers.ts";

const NOISY = `node -e 'for (let i = 1; i <= 500; i++) console.log(i === 250 ? "ALTAIR le verdict cherche" : "ligne " + i)'`;
const logs = temporaryDirectory();
const options = { cwd: PROJECT_ROOT, timeoutMs: 30_000, silenceMs: 10_000, log: { directory: logs.path, label: "test" } };

afterAll(() => logs.cleanup());

describe("la sortie d'une commande dont le verdict est au milieu", () => {
  it("coupe par le milieu, et ecrit le journal complet sur disque", async () => {
    const result = await run(NOISY, options);
    assert.equal(result.truncated, true);
    assert.ok(!result.stdout.includes("ALTAIR"));
    assert.ok(result.logPath);
    const journal = readFileSync(result.logPath, "utf8");
    assert.ok(journal.includes("ALTAIR le verdict cherche"));
    assert.ok(journal.includes("ligne 1\n"));
  });

  it("n'ecrit aucun journal quand la sortie rendue est complete", async () => {
    const result = await run("echo court", options);
    assert.equal(result.truncated, false);
    assert.equal(result.logPath, null);
  });

  it("garde le milieu quand on dit quoi chercher", async () => {
    const result = await run(NOISY, { ...options, focus: "ALTAIR" });
    assert.ok(result.stdout.includes("ALTAIR le verdict cherche"));
    assert.equal(result.focusMatched, 1);
    assert.ok(result.stdout.includes("ligne 249"));
    assert.ok(!result.stdout.includes("ligne 10\n"));
  });

  it("rend la sortie entiere plutot qu'un vide quand le motif ne trouve rien ou est invalide", () => {
    assert.deepEqual(focusOn("un\ndeux\ntrois", "quatre"), { text: "un\ndeux\ntrois", filtered: false, matched: 0 });
    assert.equal(focusOn("un\ndeux", "[").filtered, false);
  });
});

describe("le ciblage d'un fichier de test", () => {
  it("remplit le gabarit du repo et quote les motifs", () => {
    assert.equal(renderTargeting("-- -g {glob}", ["./src/lab/a.test.ts"]), "-- -g './src/lab/a.test.ts'");
    assert.ok(renderTargeting("-- -g {glob}", ["./src/**/*.test.ts"]).includes("'./src/**/*.test.ts'"));
    assert.equal(renderTargeting("-- -g {glob}", ["a.test.ts", "b.test.ts"]), "-- -g '{a.test.ts,b.test.ts}'");
    assert.equal(renderTargeting("{paths}", ["a.test.ts", "b.test.ts"]), "'a.test.ts' 'b.test.ts'");
  });

  it("ne laisse pas un drapeau nu quand aucun fichier n'est demande", () => {
    assert.equal(renderTargeting("-- -g {glob}", []), "");
    assert.equal(renderTargeting("-- -g {glob}", undefined), "");
  });

  it("lance la suite entiere recentree sur les fichiers quand le repo ne se cible pas", async () => {
    const registry = registryFrom(
      registryYaml(repoYaml("glob-fixture", { commands: '{ lint: null, typecheck: null, ut: "echo run tests/a.test.ts; echo run tests/b.test.ts", it: null, ft: null, ct: null, e2e: null }', targeting: "{ ut: null }" })),
    );
    const runner = createCheckRunner({ commandSeconds: 30, silenceSeconds: 10, logDirectory: logs.path });
    const result = await runner.run(findRepo(registry, "glob-fixture") ?? assert.fail(), "ut", PROJECT_ROOT, { paths: ["tests/a.test.ts"] });
    assert.equal(result.targeted, false);
    assert.equal(result.command, "echo run tests/a.test.ts; echo run tests/b.test.ts");
    assert.equal(result.focusMatched, 1);
    assert.ok(result.stdout.includes("a.test.ts"));
  });
});
