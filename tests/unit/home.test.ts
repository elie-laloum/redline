import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, it } from "bun:test";
import { parse, stringify } from "yaml";
import { commitHome, ensureHome, redirectTmpdir } from "../../src/app/home.ts";
import { approvedOf, deliveredOf, newLedger, readLedger, recordEvent, updateLedger, writeLedger } from "../../src/app/ledger.ts";
import { acquireLock, readLock } from "../../src/app/lock.ts";
import { migrateHome } from "../../src/app/migrate.ts";
import { lockFile, pathsOf, ticketFile } from "../../src/app/paths.ts";
import { loadConfiguration } from "../../src/app/settings.ts";
import { exampleSettings, temporaryDirectory } from "../helpers.ts";

const directory = temporaryDirectory();
const paths = pathsOf(join(directory.path, "home"));
const git = (...args: string[]) => execFileSync("git", args, { cwd: paths.home, encoding: "utf8" }).trim();

afterAll(() => directory.cleanup());

describe("le dossier redline", () => {
  it("devient un depot git avec un premier commit, ce qu'outpost exige", async () => {
    await ensureHome(paths);
    assert.ok(existsSync(join(paths.memory, "repos")));
    assert.equal(git("log", "--format=%s"), "redline: home");
  });

  it("ne versionne que la memoire et les tickets, en un seul commit", async () => {
    writeFileSync(join(paths.memory, "repos", "a.md"), "---\ntype: k\nscope: repo\nlast_verified: 2026-09-13\n---\n\nA.\n");
    writeFileSync(join(paths.logs, "bruit.log"), "x");
    assert.ok(await commitHome(paths, "memory: FT-1"));
    assert.equal(git("show", "--name-only", "--format=", "HEAD"), "memory/repos/a.md");
    assert.equal(await commitHome(paths, "memory: FT-1"), null);
  });

  it("heberge les dossiers temporaires, que colima partage avec sa VM", () => {
    const previous = process.env.TMPDIR;
    try {
      redirectTmpdir(paths);
      assert.equal(tmpdir(), paths.tmp);
      assert.ok(existsSync(paths.tmp));
    } finally {
      if (previous === undefined) delete process.env.TMPDIR;
      else process.env.TMPDIR = previous;
    }
  });
});

describe("les reglages", () => {
  it("sont les defauts du paquet quand le dossier n'en surcharge aucun, et sans registre aucun repo", () => {
    const configuration = loadConfiguration(paths);
    assert.deepEqual(configuration.sources, { settings: null, registry: null });
    assert.deepEqual(configuration.settings, exampleSettings());
    assert.deepEqual(configuration.registry.repositories, []);
  });

  it("ne prennent du fichier personnel que ses surcharges, une liste remplacant la liste par defaut", () => {
    writeFileSync(paths.settings, "schemaVersion: 2\nbudgets:\n  testAdversary: 5\nnaming:\n  types: [feature]\n");
    const { settings } = loadConfiguration(paths);
    assert.equal(settings.budgets.testAdversary, 5);
    assert.equal(settings.budgets.redChecker, exampleSettings().budgets.redChecker);
    assert.deepEqual(settings.naming.types, ["feature"]);
    execFileSync("rm", [paths.settings]);
  });

  it("reduisent une ancienne copie complete du modele a ce qui differe, en gardant l'original", () => {
    const old = { ...exampleSettings(), schemaVersion: 1, budgets: { ...exampleSettings().budgets, testAdversary: 7 }, sandbox: { image: "redline-agent:ancienne", agentChecks: true } };
    writeFileSync(paths.settings, stringify(old));
    const { settings } = loadConfiguration(paths);
    assert.equal(settings.budgets.testAdversary, 7);
    assert.equal(settings.sandbox.image, exampleSettings().sandbox.image);
    assert.deepEqual(parse(readFileSync(paths.settings, "utf8")), { schemaVersion: 2, budgets: { testAdversary: 7 }, sandbox: { agentChecks: true } });
    assert.deepEqual(parse(readFileSync(`${paths.settings}.3.bak`, "utf8")).sandbox.image, "redline-agent:ancienne");
    execFileSync("rm", [paths.settings, `${paths.settings}.3.bak`]);
  });

  it("disent ou et pourquoi un fichier est invalide", () => {
    writeFileSync(paths.settings, "schemaVersion: 2\nbudgets: { testAdversary: 0 }\n");
    assert.throws(() => loadConfiguration(paths), /budgets\.testAdversary/);
    execFileSync("rm", [paths.settings]);
  });
});

describe("le ledger", () => {
  const base = { key: "FT-1", squad: "FT", title: "Titre", url: "https://jira/FT-1", notes: null, figmaOverrides: [], budgets: exampleSettings().budgets };

  it("se relit a l'identique et trace ses evenements", () => {
    writeLedger(paths, newLedger(base));
    const updated = updateLedger(paths, "FT-1", (ledger) => recordEvent({ ...ledger, phase: "delivery" }, "plan approuve"));
    assert.equal(readLedger(paths, "FT-1")?.phase, "delivery");
    assert.deepEqual(updated.history.map((entry) => entry.event), ["run ouvert", "plan approuve"]);
  });

  it("refuse un ledger corrompu plutot que de repartir de travers", () => {
    writeFileSync(ticketFile(paths, "FT-2"), "key: FT-2\nphase: nulle-part\n");
    assert.throws(() => readLedger(paths, "FT-2"), /Ledger illisible/);
  });

  it("refuse de passer a une phase la sortie de la precedente qu'elle ne sait pas relire", () => {
    writeLedger(paths, { ...newLedger({ ...base, key: "FT-3" }), phase: "closing", approved: { decision: "approve", note: null } });
    const ledger = readLedger(paths, "FT-3");
    assert.ok(ledger);
    assert.throws(() => approvedOf(ledger), (error: Error & { hint?: string }) => /Ledger illisible : FT-3, champ approved/.test(error.message) && /^ticket : /m.test(error.hint ?? ""));
    assert.throws(() => deliveredOf(ledger), /champ delivered/);
  });

  it("n'existe pas avant le premier start", () => {
    assert.equal(readLedger(paths, "FT-404"), null);
    assert.throws(() => updateLedger(paths, "FT-404", (ledger) => ledger), (error: Error & { hint?: string }) => /bun redline start FT-404/.test(error.hint ?? ""));
  });
});

describe("le verrou d'un ticket", () => {
  it("refuse un second run tant que le premier vit", async () => {
    const child = spawn("sleep", ["30"]);
    mkdirSync(paths.locks, { recursive: true });
    writeFileSync(lockFile(paths, "FT-3"), JSON.stringify({ runId: "autre", pid: child.pid, at: "2026-09-30" }));
    assert.throws(() => acquireLock(paths, "FT-3", "moi"), /deja en cours/);
    child.kill();
    await new Promise((resolve) => child.on("exit", resolve));
  });

  it("reprend un verrou abandonne par un process mort, et le rend", () => {
    const lock = acquireLock(paths, "FT-3", "moi");
    assert.equal(lock.reclaimed?.runId, "autre");
    assert.equal(readLock(paths, "FT-3")?.pid, process.pid);
    lock.release();
    assert.equal(readLock(paths, "FT-3"), null);
  });
});

describe("la migration depuis autopilot", () => {
  it("copie la memoire sans ecraser, archive les tickets et liste les vieux worktrees", () => {
    const old = join(directory.path, "autopilot");
    mkdirSync(join(old, "memory", "repos"), { recursive: true });
    mkdirSync(join(old, "tickets"), { recursive: true });
    mkdirSync(join(old, "worktrees", "FT-9", "web-app"), { recursive: true });
    writeFileSync(join(old, "memory", "repos", "a.md"), "ancienne");
    writeFileSync(join(old, "memory", "repos", "b.md"), "nouvelle");
    writeFileSync(join(old, "tickets", "FT-9.yaml"), "ticket: {}");

    const report = migrateHome(old, paths);
    assert.deepEqual(report.copiedNotes, ["repos/b.md"]);
    assert.deepEqual(report.skippedNotes, ["repos/a.md"]);
    assert.deepEqual(report.archivedTickets, ["FT-9.yaml"]);
    assert.equal(report.legacyWorktrees.length, 1);
    assert.ok(existsSync(join(paths.tickets, "autopilot", "FT-9.yaml")));
  });
});
