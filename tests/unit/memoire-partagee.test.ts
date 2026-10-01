import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { afterAll, describe, it } from "bun:test";
import { commitHome, ensureHome } from "../../src/app/home.ts";
import { commitMemory, connectMemory, ensureMemory, memoryRepository, pullMemory } from "../../src/app/memory-repository.ts";
import { pathsOf } from "../../src/app/paths.ts";
import { exampleSettings, temporaryDirectory } from "../helpers.ts";

const directory = temporaryDirectory("redline-memoire-");
afterAll(() => directory.cleanup());

const git = (cwd: string, ...args: string[]) => execFileSync("git", ["-c", "user.name=test", "-c", "user.email=test@x", ...args], { cwd, encoding: "utf8" }).trim();
const note = (root: string, path: string, text: string) => {
  mkdirSync(dirname(join(root, path)), { recursive: true });
  writeFileSync(join(root, path), `---\ntype: knowledge\nscope: ${path.split("/")[0]?.replace(/s$/, "")}\nlast_verified: 2026-10-01\n---\n\n${text}\n`);
};

/** A bare remote holding one note, the memory the team already shares. */
function sharedRemote(name: string): string {
  const remote = join(directory.path, `${name}.git`);
  const seed = join(directory.path, `${name}-seed`);
  execFileSync("git", ["init", "-q", "--bare", "-b", "main", remote]);
  execFileSync("git", ["clone", "-q", remote, seed], { stdio: "ignore" });
  note(seed, "repos/existante.md", "Deja partagee.");
  git(seed, "add", "-A");
  git(seed, "commit", "-q", "-m", "seed");
  git(seed, "push", "-q", "origin", "main");
  return remote;
}

const settings = (memory: { repository?: string; path?: string }) => ({ ...exampleSettings(), memory: { ...exampleSettings().memory, repository: memory.repository ?? null, path: memory.path ?? null } });

describe("la memoire dans son propre depot", () => {
  it("vit dans le home tant qu'aucun depot n'est donne, dans son clone sinon", () => {
    assert.deepEqual(memoryRepository(settings({}), "/h"), { directory: "/h/memory", separate: false, url: null });
    assert.deepEqual(memoryRepository(settings({ repository: "git@x:m.git" }), "/h"), { directory: "/h/memory", separate: true, url: "git@x:m.git" });
    assert.deepEqual(memoryRepository(settings({ path: "/ailleurs/memoire" }), "/h"), { directory: "/ailleurs/memoire", separate: true, url: null });
  });

  it("se raccorde a une URL : clone dans le home, import des notes sans ecraser, depot du home allege", async () => {
    const remote = sharedRemote("equipe");
    const paths = pathsOf(join(directory.path, "home"));
    await ensureHome(paths);
    note(paths.memory, "features/locale.md", "Apprise seul.");
    note(paths.memory, "repos/existante.md", "Version locale.");
    await commitHome(paths, "memory: FT-1");

    const connected = await connectMemory(paths, { url: remote }, { importNotes: true, committer: { name: "Ada", email: "ada@x" } });
    assert.deepEqual([connected.imported, connected.skipped], [["features/locale.md"], ["repos/existante.md"]]);
    assert.ok(connected.archived && existsSync(join(connected.archived, "features/locale.md")));
    assert.equal(connected.warning, null);
    assert.match(readFileSync(join(paths.memory, "repos/existante.md"), "utf8"), /Deja partagee/);
    assert.equal(git(remote, "log", "-1", "--format=%an %s"), "Ada memory: import depuis le home redline");
    assert.equal(git(paths.home, "ls-files", "memory"), "");
    assert.doesNotMatch(readFileSync(join(paths.home, ".gitignore"), "utf8"), /memory/);
  });

  it("tire les notes des autres avant d'ecrire, et garde son commit local quand le push est refuse", async () => {
    const remote = sharedRemote("synchro");
    const mine = { directory: join(directory.path, "moi"), separate: true, url: remote };
    await ensureMemory(mine);
    const teammate = join(directory.path, "collegue");
    execFileSync("git", ["clone", "-q", remote, teammate]);

    note(teammate, "features/collegue.md", "Sa note.");
    git(teammate, "add", "-A");
    git(teammate, "commit", "-q", "-m", "memory: FT-2");
    git(teammate, "push", "-q");
    assert.equal(await pullMemory(mine), null);
    assert.ok(existsSync(join(mine.directory, "features/collegue.md")));

    note(teammate, "features/encore.md", "Une autre.");
    git(teammate, "add", "-A");
    git(teammate, "commit", "-q", "-m", "memory: FT-3");
    git(teammate, "push", "-q");
    note(mine.directory, "features/mienne.md", "La mienne.");
    const committed = await commitMemory(mine, "memory: FT-4", { name: "Ada", email: "ada@x" });
    assert.ok(committed.commit);
    assert.match(committed.warning ?? "", new RegExp(`le commit ${committed.commit} reste local`));
    assert.equal(await pullMemory(mine), null);
    assert.ok(existsSync(join(mine.directory, "features/encore.md")));
  });

  it("refuse un chemin qui n'est pas un clone", async () => {
    const path = join(directory.path, "pas-un-clone");
    mkdirSync(path, { recursive: true });
    await assert.rejects(() => ensureMemory({ directory: path, separate: true, url: null }), /n'est pas un depot git/);
  });
});
