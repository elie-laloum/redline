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
