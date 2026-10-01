import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, describe, it } from "bun:test";
import { pathsOf } from "../../src/app/paths.ts";
import { addRepository, detectRepository, projectOf, proposedLevel, removeRepository, setRepositoryField } from "../../src/app/registry-file.ts";
import { loadRegistry } from "../../src/app/settings.ts";
import { temporaryDirectory } from "../helpers.ts";

const directory = temporaryDirectory("redline-registre-");
afterAll(() => directory.cleanup());

function checkout(name: string, files: Record<string, string>): string {
  const root = join(directory.path, name);
  mkdirSync(root, { recursive: true });
  for (const [path, text] of Object.entries(files)) writeFileSync(join(root, path), text);
  execFileSync("git", ["init", "-q", "-b", "develop", root]);
  execFileSync("git", ["-C", root, "remote", "add", "origin", `git@gitlab.example.com:equipe/${name}.git`]);
  return root;
}

describe("le registre ecrit par init", () => {
  it("lit d'un checkout ce qu'il dit de lui-meme, sans jamais deviner une commande", async () => {
    const root = checkout("core", { "package.json": JSON.stringify({ name: "@equipe/core", description: "Le coeur." }), "pnpm-lock.yaml": "", "turbo.json": "{}" });
    const { entry, guessed } = await detectRepository(root);
    assert.deepEqual([entry.name, entry.gitlabProject, entry.packageManager, entry.monorepoTool, entry.packageName, entry.description], ["core", "equipe/core", "pnpm", "turbo", "@equipe/core", "Le coeur."]);
    assert.ok(Object.values(entry.commands).every((command) => command === null));
    assert.equal(entry.withoutTests, true);
    assert.deepEqual(guessed, ["baseBranch"]);
    assert.equal(entry.baseBranch, "develop");
  });

  it("reconnait les remotes ssh et https", () => {
    assert.equal(projectOf("git@gitlab.com:groupe/sous/projet.git"), "groupe/sous/projet");
    assert.equal(projectOf("https://gitlab.example.com/groupe/projet.git"), "groupe/projet");
    assert.equal(projectOf("ssh://git@gitlab.example.com:2222/groupe/projet.git"), "groupe/projet");
    assert.equal(projectOf(""), null);
  });

  it("ajoute un depot, puis ne change que le champ vise, withoutTests suivant les commandes de test", async () => {
    const paths = pathsOf(join(directory.path, "home"));
    mkdirSync(paths.home, { recursive: true });
    writeFileSync(paths.registry, "# mes depots\nschemaVersion: 1\nrepositories: []\n");
    addRepository(paths, (await detectRepository(checkout("app", {}))).entry);
    setRepositoryField(paths, "app", ["commands", "ut"], "npm test");
    let repo = loadRegistry(paths).repositories[0];
    assert.deepEqual([repo?.commands.ut, repo?.withoutTests], ["npm test", false]);
    setRepositoryField(paths, "app", ["commands", "ut"], null);
    repo = loadRegistry(paths).repositories[0];
    assert.equal(repo?.withoutTests, true);
    assert.match(readFileSync(paths.registry, "utf8"), /^# mes depots\n/);
  });

  it("refuse une dependance qui remonterait les levels, et propose le level le plus bas qui tienne", async () => {
    const paths = pathsOf(join(directory.path, "home-levels"));
    mkdirSync(paths.home, { recursive: true });
    addRepository(paths, (await detectRepository(checkout("socle", {}))).entry);
    addRepository(paths, (await detectRepository(checkout("ecran", {}))).entry);
    assert.throws(() => setRepositoryField(paths, "ecran", ["dependsOn"], ["socle"]), /l'amont doit avoir un level inferieur/);
    assert.equal(proposedLevel(loadRegistry(paths), ["socle"]), 2);
    setRepositoryField(paths, "ecran", ["level"], 2);
    setRepositoryField(paths, "ecran", ["dependsOn"], ["socle"]);
    removeRepository(paths, "ecran");
    assert.deepEqual(loadRegistry(paths).repositories.map((repo) => repo.name), ["socle"]);
  });
});
