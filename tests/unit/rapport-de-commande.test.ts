import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, describe, it } from "bun:test";
import { createCheckRunner } from "../../src/adapters/checks.ts";
import { findRepo } from "../../src/domain/config.ts";
import { registryFrom, registryYaml, repoYaml, temporaryDirectory } from "../helpers.ts";

const REGISTRY = registryFrom(
  registryYaml(
    repoYaml("front-fixture", {
      commands: '{ lint: "false", typecheck: null, ut: "true", it: null, ft: null, ct: null, e2e: null }',
      reports: '{ lint: "{apps,packages}/*/code-quality.json" }',
    }),
    repoYaml("back-fixture", { commands: '{ lint: "false", typecheck: null, ut: "true", it: null, ft: null, ct: null, e2e: null }' }),
  ),
);
const logs = temporaryDirectory();
const runner = createCheckRunner({ commandSeconds: 30, silenceSeconds: 10, logDirectory: logs.path });
const repo = (name: string) => findRepo(REGISTRY, name) ?? assert.fail();

afterAll(() => logs.cleanup());

describe("le rapport d'une commande qui n'ecrit pas sur sa sortie", () => {
  it("remonte les diagnostics du fichier quand la commande echoue", async () => {
    const worktree = temporaryDirectory();
    mkdirSync(join(worktree.path, "apps", "lab"), { recursive: true });
    writeFileSync(
      join(worktree.path, "apps", "lab", "code-quality.json"),
      JSON.stringify([
        {
          description: "This hook does not specify its dependency on setResponsibleId.",
          check_name: "lint/correctness/useExhaustiveDependencies",
          severity: "major",
          location: { path: "src/components/LabHeaderActions.spec.tsx", lines: { begin: 162 } },
        },
      ]),
    );
    const result = await runner.run(repo("front-fixture"), "lint", worktree.path);
    worktree.cleanup();

    assert.equal(result.passed, false);
    assert.equal(result.stdout.trim(), "");
    assert.deepEqual(result.report?.from, ["apps/lab/code-quality.json"]);
    assert.equal(result.report?.diagnostics[0]?.line, 162);
    assert.match(result.report?.diagnostics[0]?.rule ?? "", /useExhaustiveDependencies/);
  });

  it("ne remonte rien plutot que de deviner quand le fichier n'est pas du format attendu", async () => {
    const worktree = temporaryDirectory();
    mkdirSync(join(worktree.path, "apps", "web"), { recursive: true });
    writeFileSync(join(worktree.path, "apps", "web", "code-quality.json"), "pas du json");
    const result = await runner.run(repo("front-fixture"), "lint", worktree.path);
    worktree.cleanup();
    assert.equal(result.report, null);
  });

  it("ne cherche aucun fichier pour un repo qui n'en declare pas", async () => {
    const worktree = temporaryDirectory();
    const result = await runner.run(repo("back-fixture"), "lint", worktree.path);
    worktree.cleanup();
    assert.equal(result.passed, false);
    assert.equal(result.report, null);
  });

  it("ne lance rien pour un type que le registre ne declare pas", async () => {
    const result = await runner.run(repo("back-fixture"), "e2e", logs.path);
    assert.equal(result.ran, false);
    assert.equal(result.command, null);
  });
});
