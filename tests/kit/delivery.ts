import type { Ledger } from "../../src/app/ledger.ts";
import type { Plan } from "../../src/domain/plan.ts";
import { defineDelivery } from "../../src/phases/delivery/workflow.ts";
import type { FramingOutcome } from "../../src/phases/framing/workflow.ts";
import { ISSUE, plan } from "./framing.ts";
import type { World } from "./world.ts";

export function approved(world: World, override?: Plan): FramingOutcome {
  const chosen = override ?? (plan() as Plan);
  return {
    decision: "approve",
    note: null,
    ticket: {
      key: ISSUE.key,
      squad: "FT",
      title: ISSUE.summary,
      description: ISSUE.description,
      criteria: [{ id: "AC1", text: "La periode par defaut est le mois en cours" }],
      issueType: "Story",
      status: "READY TO DEV",
      url: `${world.jira.url}/browse/${ISSUE.key}`,
      labels: [],
      links: [],
    },
    figma: { frames: [], skipped: [] },
    functional: { arbitrages: [{ question: "Periode par defaut ?", answer: "Mois en cours", why: "humain" }], contradictions: [] },
    technical: { arbitrages: [], contradictions: [] },
    scope: { impacted: chosen.repos.map((entry, index) => ({ repo: entry.repo, level: index + 1, area: "zone", evidence: ["src/x.js:1 — x"] })), excluded: [] },
    plan: chosen,
    contradictions: [],
  };
}

export async function deliver(world: World, ledger: Ledger, framing: FramingOutcome, options: { resume?: boolean; signal?: AbortSignal } = {}) {
  const delivery = defineDelivery({ ...world.run(ledger), framing, ...(options.signal ? { signal: options.signal } : {}) });
  const checkpoint = { store: world.storage(ledger.key).checkpoints, runId: `${ledger.key}/delivery/${ledger.delivery.generation}`, version: "test", ...(options.resume ? { resume: "retry-incomplete" as const } : {}) };
  const result = await delivery.workflow.start({ checkpoint, ...(options.signal ? { signal: options.signal } : {}) });
  return { result, outcome: result.status === "done" ? delivery.outcome(result) : null };
}

const header = "import assert from 'node:assert/strict';\nimport { test } from 'node:test';\nimport { clamp } from '../src/period.js';\n\n";
export const PASSING_TEST = `${header}test('clamp garde une periode donnee', () => {\n  assert.equal(clamp('2026-09'), '2026-09');\n});\n`;
export const FAILING_TEST = `${header}test('sans periode, clamp rend le mois en cours', () => {\n  assert.equal(clamp(undefined), '2026-09');\n});\n`;
export const IMPLEMENTATION = "export function clamp(period) {\n  return period ?? '2026-09';\n}\n";

export const testsReply = (path = "tests/period-default.test.js") => ({ files: [{ path, tests: ["T1"] }], commit: { type: "test", scope: "period", subject: "cover the default period" }, uncoverable: [] });
export const allPass = (ids: string[]) => ({ lines: ids.map((id) => ({ id, verdict: "passe", evidence: "tests/period-default.test.js:5", comment: "" })), weaknesses: [] });
export const goodRed = { tests: [{ name: "sans periode, clamp rend le mois en cours", verdict: "bon-rouge", reason: "AssertionError" }], environment: { blocked: false, reason: "" } };

export const codeReply = (appeals: unknown[] = []) => ({ commit: { type: "feat", scope: "period", subject: "default to the current month" }, appeals, contradictions: [] });
export const codePass = (ids: string[]) => ({ lines: ids.map((id) => ({ id, verdict: "passe", evidence: "src/period.js:2", comment: "" })), remarks: [] });
export const codeRefuse = (ids: string[]) => ({ lines: ids.map((id) => ({ id, verdict: "manque", evidence: "src/period.js:2", comment: "le mois est fige" })), remarks: [] });
export const testsPhase = {
  "test-writer": [{ writes: { "tests/period-default.test.js": FAILING_TEST }, reply: testsReply() }],
  "test-adversary": [{ reply: allPass(["T1"]) }],
  "red-checker": [{ reply: goodRed }],
};

const listHeader = "import assert from 'node:assert/strict';\nimport { test } from 'node:test';\nimport { list } from '../src/list.js';\n\n";
export const FAILING_LIST_TEST = `${listHeader}test('la liste filtre par periode', () => {\n  assert.deepEqual(list('2026-09'), ['2026-09']);\n});\n`;
export const LIST_IMPLEMENTATION = "export function list(period) {\n  return period ? [period] : [];\n}\n";

export function twoRepoPlan(): Plan {
  const base = plan() as Plan;
  const core = base.repos[0] as Plan["repos"][number];
  return {
    ...base,
    repos: [
      core,
      {
        repo: "fixture-app",
        type: "feature",
        changes: ["La liste filtre par periode."],
        why: "Consomme la periode de fixture-core.",
        tests: [{ id: "T2", criterion: "La liste rend la periode demandee.", kind: "ut", covers: ["AC1"] }],
        code: [{ id: "C2", criterion: "La liste sans periode reste vide." }],
      },
    ],
  };
}

export const appPhase = {
  "test-writer": [{ writes: { "tests/list-period.test.js": FAILING_LIST_TEST }, reply: { files: [{ path: "tests/list-period.test.js", tests: ["T2"] }], commit: { type: "test", scope: "list", subject: "cover the period filter" }, uncoverable: [] } }],
  "test-adversary": [{ reply: allPass(["T2"]) }],
  "red-checker": [{ reply: { tests: [{ name: "la liste filtre par periode", verdict: "bon-rouge", reason: "AssertionError" }], environment: { blocked: false, reason: "" } } }],
  developer: [{ writes: { "src/list.js": LIST_IMPLEMENTATION }, reply: { commit: { type: "feat", scope: "list", subject: "filter by period" }, appeals: [], contradictions: [] } }],
  "code-adversary": [{ reply: codePass(["C2"]) }],
};

export function merge(...scripts: Record<string, unknown[]>[]): Record<string, unknown[]> {
  const merged: Record<string, unknown[]> = {};
  for (const script of scripts) for (const [role, turns] of Object.entries(script)) merged[role] = [...(merged[role] ?? []), ...turns];
  return merged;
}
