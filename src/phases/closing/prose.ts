import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { Task } from "@elie-laloum/outpost";
import { finalizer } from "../../agents/finalizer.ts";
import { arbitrages, bullets } from "../../agents/render.ts";
import { ask } from "../../agents/role.ts";
import { TEMPLATES } from "../../app/paths.ts";
import { digest } from "../../domain/digest.ts";
import { renderPlan } from "../../domain/plan.ts";
import { publishableProblems } from "../../domain/voice.ts";
import { type Converged, converge } from "../../workflow/converge.ts";
import { cached, withReader } from "../run.ts";
import type { ClosingContext } from "./context.ts";

export interface Prose {
  readonly mergeRequests: readonly { readonly repo: string; readonly summary: string }[];
  readonly slack: string;
  readonly jira: string;
}

export function voiceOf(run: ClosingContext): { rules: string; calibrated: boolean } {
  if (existsSync(run.app.paths.voice)) return { rules: readFileSync(run.app.paths.voice, "utf8"), calibrated: true };
  return { rules: readFileSync(join(TEMPLATES, "voice.template.md"), "utf8"), calibrated: false };
}

export function proseTask(run: ClosingContext, after: readonly Task[]): Task<Converged<Prose>> {
  const voice = voiceOf(run);
  return converge<Prose>({
    key: "prose",
    after,
    cache: cached(run, ["finalizer"], () => digest({ framing: run.framing, delivered: run.delivered, voice })),
    ...(run.events ? { events: run.events } : {}),
    make: (context, carry) =>
      withReader(run, "finalizer", { task: "prose" }, (session) =>
        ask(context, session, finalizer, {
          ticket: run.framing.ticket,
          notes: run.ledger.notes,
          arbitrages: arbitrages([...run.framing.functional.arbitrages, ...run.framing.technical.arbitrages]),
          plan: renderPlan(run.framing.plan),
          repos: run.delivered.map((repo) => ({ repo: repo.repo, commits: repo.commits })),
          voice: voice.rules,
          calibrated: voice.calibrated,
          feedback: carry.feedback?.text ?? null,
        }),
      ),
    gates: [
      {
        name: "publiable",
        budget: run.ledger.budgets.proseRepairs,
        async judge(_context, prose) {
          const problems = [
            ...publishableProblems(prose.slack).map((problem) => `message Slack : ${problem}`),
            ...publishableProblems(prose.jira).map((problem) => `commentaire Jira : ${problem}`),
            ...prose.mergeRequests.flatMap((entry) => publishableProblems(entry.summary).map((problem) => `MR ${entry.repo} : ${problem}`)),
          ];
          return problems.length === 0 ? { kind: "pass" } : { kind: "feedback", text: `Ces textes ne peuvent pas partir tels quels :\n${bullets(problems)}` };
        },
      },
    ],
  });
}
