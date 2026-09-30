import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, describe, it } from "bun:test";
import { defineJsonResponse, defineTask, defineWorkflow, openWorkspace } from "@elie-laloum/outpost";
import { createLocalSandboxProvider } from "@elie-laloum/outpost/providers/local";
import * as roles from "../../src/agents/index.ts";
import { ask, type Role } from "../../src/agents/role.ts";
import { ROLE_NAMES } from "../../src/domain/roles.ts";
import { fakeAgents } from "../kit/agents.ts";
import { PLAN_REPO, TICKET } from "../kit/samples.ts";
import { temporaryDirectory } from "../helpers.ts";

const grill = { done: false, questions: [{ id: "q", header: "Periode", text: "Laquelle ?", options: ["mois", "annee"] }], arbitrages: [], contradictions: [] };
const verdictLine = (id: string) => ({ id, verdict: "passe", evidence: "src/a.ts:1", comment: "" });

interface Case {
  readonly role: Role<never, unknown>;
  readonly input: unknown;
  readonly ok: unknown;
  readonly ko: unknown;
}

const CASES: Case[] = [
  { role: roles.functionalGrill, input: { ticket: TICKET, notes: null, figma: "(aucune)", memory: "", transcript: [], turn: 1, maxTurns: 5, reopen: null }, ok: grill, ko: { ...grill, questions: [] } },
  { role: roles.technicalGrill, input: { ticket: TICKET, notes: null, functional: "", scope: "", conventions: "", memory: "", transcript: [], turn: 1, maxTurns: 5, reopen: null }, ok: { ...grill, done: true, questions: [] }, ko: { ...grill, done: true } },
  {
    role: roles.scopeScout,
    input: { ticket: TICKET, notes: null, functional: "", repo: { name: "core", level: 1, layer: "backend", description: "d" }, path: "/repos/core", memory: "", feedback: null },
    ok: { impacted: false, area: "", evidence: [], reason: "rien a changer", contradictions: [] },
    ko: { impacted: true, area: "x", evidence: [], reason: "impacte sans preuve", contradictions: [] },
  },
  {
    role: roles.planner,
    input: { ticket: TICKET, notes: null, functional: "", technical: "", scope: "", repos: "", types: ["feature"], memory: "", feedback: null },
    ok: { summary: "Plan.", repos: [PLAN_REPO], openPoints: [] },
    ko: { summary: "Plan.", repos: [{ ...PLAN_REPO, code: [] }], openPoints: [] },
  },
  {
    role: roles.testWriter,
    input: { ticket: TICKET, notes: null, entry: PLAN_REPO, arbitrages: "", kinds: ["ut"], feedback: null },
    ok: { files: [{ path: "tests/a.test.js", tests: ["T1"] }], commit: { type: "test", subject: "cover the period" }, uncoverable: [] },
    ko: { files: [], commit: { type: "test", subject: "nothing" }, uncoverable: [] },
  },
  {
    role: roles.appealArbiter,
    input: { repo: "core", notes: null, tests: PLAN_REPO.tests, appeal: { kind: "test-conteste", test: "T1", reason: "inverse" }, previous: [] },
    ok: { decision: "refuse", reason: "le test est juste", commit: null },
    ko: { decision: "accepte", reason: "corrige", commit: null },
  },
  {
    role: roles.testAdversary,
    input: { ticket: TICKET, notes: null, repo: "core", tests: PLAN_REPO.tests, files: ["tests/a.test.js"], kinds: ["ut"] },
    ok: { lines: [verdictLine("T1")], weaknesses: [] },
    ko: { lines: [verdictLine("T1"), verdictLine("T9")], weaknesses: [] },
  },
  {
    role: roles.redChecker,
    input: { repo: "core", notes: null, files: ["tests/a.test.js"], command: "npm test", output: "AssertionError" },
    ok: { tests: [{ name: "a", verdict: "bon-rouge", reason: "AssertionError" }], environment: { blocked: false, reason: "" } },
    ko: { tests: [{ name: "a", verdict: "rouge", reason: "?" }], environment: { blocked: false, reason: "" } },
  },
  {
    role: roles.developer,
    input: { ticket: TICKET, notes: null, entry: PLAN_REPO, batch: PLAN_REPO.code, arbitrages: "", checks: "", feedback: null },
    ok: { commit: { type: "feat", subject: "add the period" }, appeals: [], contradictions: [] },
    ko: { commit: { type: "wip", subject: "x" }, appeals: [], contradictions: [] },
  },
  {
    role: roles.codeAdversary,
    input: { ticket: TICKET, notes: null, repo: "core", code: PLAN_REPO.code, arbitrages: "", base: "abc123" },
    ok: { lines: [verdictLine("C1")], remarks: [] },
    ko: { lines: [], remarks: [] },
  },
  {
    role: roles.memoryPlanner,
    input: { ticket: TICKET, notes: null, arbitrages: "", plan: "", delivered: "", contradictions: "", index: "", today: "2026-09-30", maxNoteLines: 100, feedback: null },
    ok: { operations: [{ action: "delete", path: "changes/x.md", why: "fusionnee" }], decisions: [] },
    ko: { operations: [{ action: "rename", path: "changes/x.md", why: "?" }], decisions: [] },
  },
  {
    role: roles.finalizer,
    input: { ticket: TICKET, notes: null, arbitrages: "", plan: "", repos: [{ repo: "core", commits: ["feat: x"] }], voice: "", calibrated: false, feedback: null },
    ok: { mergeRequests: [{ repo: "core", summary: "Ajoute la periode." }], slack: "Salut.", jira: "Decisions." },
    ko: { mergeRequests: [], slack: "Salut.", jira: "Decisions." },
  },
];

const placeholders = (text: string) => new Set([...text.matchAll(/\{\{\s*([A-Za-z_][A-Za-z0-9_]*)\s*\}\}/g)].map((match) => match[1]).filter((name) => name !== "WORK_BRANCH" && name !== "BASE_BRANCH"));

describe("le contrat de chaque prompt", () => {
  it("couvre chaque role, une fois", () => {
    assert.deepEqual(CASES.map((entry) => entry.role.name).sort(), [...ROLE_NAMES].sort());
  });

  for (const entry of CASES) {
    describe(entry.role.name, () => {
      const source = existsSync(entry.role.prompt) ? readFileSync(entry.role.prompt, "utf8") : "";
      const response = () => defineJsonResponse({ tag: entry.role.tag, schema: entry.role.schema(entry.input as never) });

      it("a un brief qui porte exactement les variables fournies", () => {
        assert.ok(source, `${entry.role.prompt} absent`);
        assert.deepEqual([...placeholders(source)].sort(), Object.keys(entry.role.values(entry.input as never)).sort());
      });

      it("annonce sa balise de reponse", () => {
        assert.ok(source.includes(`<${entry.role.tag}>`));
      });

      it("accepte une reponse conforme et refuse une reponse qui ne l'est pas", async () => {
        const wrap = (value: unknown) => `bla\n<${entry.role.tag}>${JSON.stringify(value)}</${entry.role.tag}>`;
        await response().read(wrap(entry.ok));
        await assert.rejects(() => response().read(wrap(entry.ko)));
      });
    });
  }
});

describe("un agent en sandbox", () => {
  const directory = temporaryDirectory();
  afterAll(() => directory.cleanup());

  it("ecrit dans son worktree et rend une reponse typee, apres une reparation", async () => {
    const git = (...args: string[]) => execFileSync("git", args, { cwd: directory.path, encoding: "utf8" });
    git("init", "-q", "-b", "main");
    writeFileSync(join(directory.path, "a.txt"), "a\n");
    git("add", ".");
    git("-c", "user.email=t@t", "-c", "user.name=t", "commit", "-qm", "init");
    const agents = fakeAgents({
      developer: [{ writes: { "src/period.js": "export const period = 1;\n" }, reply: { commit: { type: "oops" } }, repairedReply: { commit: { type: "feat", subject: "add the period" }, appeals: [], contradictions: [] } }],
    });
    const workspace = await openWorkspace({ repository: directory.path, branch: { mode: "named", name: "feat/FT-1025" } });
    const sandbox = await workspace.sandbox({ sandboxProvider: createLocalSandboxProvider() });
    const input = { ticket: TICKET, notes: null, entry: PLAN_REPO, batch: PLAN_REPO.code, arbitrages: "", checks: "", feedback: null };
    const task = defineTask({ key: "developer-lot", perform: (context) => ask(context, { sandbox, agents }, roles.developer, input) });
    const result = await defineWorkflow("prompts", [task]).start();
    await sandbox.close();
    result.unwrap();
    assert.equal(result.value(task).commit?.subject, "add the period");
    assert.equal(readFileSync(join(workspace.directory, "src/period.js"), "utf8"), "export const period = 1;\n");
    assert.match(agents.prompts.developer?.[0] ?? "", /C1 Les appelants compilent sans changement\./);
    assert.deepEqual(agents.remaining(), {});
    await workspace.close();
  });
});
