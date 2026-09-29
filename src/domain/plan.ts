import * as v from "valibot";
import { declaredTestKinds, type RepoEntry, TEST_KINDS } from "./config.ts";
import type { ScopeEntry } from "./scope.ts";
import type { Criterion } from "./ticket.ts";

const text = v.pipe(v.string(), v.trim(), v.minLength(1));

export const PlanTestSchema = v.object({
  id: v.pipe(v.string(), v.regex(/^T\d+$/, "identifiant de test attendu : T1, T2…")),
  criterion: text,
  kind: v.picklist(TEST_KINDS),
  covers: v.array(text),
});

export const PlanCodeSchema = v.object({
  id: v.pipe(v.string(), v.regex(/^C\d+$/, "identifiant de ligne de code attendu : C1, C2…")),
  criterion: text,
});

export const PlanRepoSchema = v.object({
  repo: text,
  type: text,
  changes: v.pipe(v.array(text), v.minLength(1)),
  why: text,
  tests: v.array(PlanTestSchema),
  code: v.pipe(v.array(PlanCodeSchema), v.minLength(1)),
});

export const PlanSchema = v.object({
  summary: text,
  repos: v.pipe(v.array(PlanRepoSchema), v.minLength(1)),
  openPoints: v.array(text),
});

export type PlanTest = v.InferOutput<typeof PlanTestSchema>;
export type PlanCode = v.InferOutput<typeof PlanCodeSchema>;
export type PlanRepo = v.InferOutput<typeof PlanRepoSchema>;
export type Plan = v.InferOutput<typeof PlanSchema>;

export interface PlanContext {
  readonly criteria: readonly Criterion[];
  readonly scope: readonly ScopeEntry[];
  readonly repos: readonly RepoEntry[];
  readonly types: readonly string[];
}

export function planProblems(plan: Plan, context: PlanContext): string[] {
  const problems: string[] = [];
  const expected = [...context.scope].sort((a, b) => a.level - b.level || a.repo.localeCompare(b.repo)).map((entry) => entry.repo);
  const planned = plan.repos.map((entry) => entry.repo);
  for (const repo of expected) if (!planned.includes(repo)) problems.push(`le repo ${repo} du perimetre n'a pas de plan`);
  for (const repo of planned) if (!expected.includes(repo)) problems.push(`le repo ${repo} n'est pas dans le perimetre`);
  const kept = planned.filter((repo) => expected.includes(repo));
  if (kept.join() !== expected.filter((repo) => planned.includes(repo)).join()) problems.push(`ordre attendu (level croissant) : ${expected.join(" → ")}`);

  const ids = plan.repos.flatMap((entry) => [...entry.tests, ...entry.code].map((line) => line.id));
  for (const id of new Set(ids.filter((id, index) => ids.indexOf(id) !== index))) problems.push(`l'identifiant ${id} apparait plusieurs fois`);

  const known = new Set(context.criteria.map((criterion) => criterion.id));
  const covered = new Set<string>();
  for (const entry of plan.repos) {
    const repo = context.repos.find((candidate) => candidate.name === entry.repo);
    if (!context.types.includes(entry.type)) problems.push(`${entry.repo} : type de branche ${entry.type} inconnu (${context.types.join(", ")})`);
    const declared = repo ? declaredTestKinds(repo) : [];
    for (const test of entry.tests) {
      if (!declared.includes(test.kind)) {
        problems.push(`${entry.repo} ${test.id} : le registre ne declare pas de commande ${test.kind} (types disponibles : ${declared.join(", ") || "aucun"})`);
      }
      for (const criterion of test.covers) {
        if (known.has(criterion)) covered.add(criterion);
        else problems.push(`${entry.repo} ${test.id} couvre ${criterion}, qui n'est pas un critere du ticket`);
      }
    }
  }
  for (const criterion of context.criteria) {
    if (!covered.has(criterion.id)) problems.push(`le critere ${criterion.id} (« ${criterion.text} ») n'est couvert par aucun test`);
  }
  return problems;
}

export function batches<T>(lines: readonly T[], size: number): T[][] {
  const result: T[][] = [];
  for (let index = 0; index < lines.length; index += size) result.push(lines.slice(index, index + size));
  return result;
}

export function renderPlan(plan: Plan): string {
  const sections = plan.repos.map((entry, index) =>
    [
      `${index + 1}. ${entry.repo} (${entry.type}) — ${entry.why}`,
      ...entry.changes.map((change) => `   - ${change}`),
      ...entry.tests.map((test) => `   ${test.id} [${test.kind}] ${test.criterion} (${test.covers.join(", ")})`),
      ...entry.code.map((line) => `   ${line.id} ${line.criterion}`),
    ].join("\n"),
  );
  const open = plan.openPoints.length ? ["", "Points ouverts :", ...plan.openPoints.map((point) => `- ${point}`)] : [];
  return [plan.summary, "", ...sections, ...open].join("\n");
}
