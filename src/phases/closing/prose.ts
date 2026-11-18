import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { Task } from "@elie-laloum/outpost/workflows";
import { finalizer } from "../../agents/finalizer.ts";
import { bullets, framingArbitrages } from "../../agents/render.ts";
import { ask } from "../../agents/role.ts";
import { TEMPLATES } from "../../app/paths.ts";
import { digest } from "../../domain/digest.ts";
import { renderReviewedPoint, type ReviewedPoint } from "../../domain/open-points.ts";
import { renderPlan } from "../../domain/plan.ts";
import { publishableProblems } from "../../domain/voice.ts";
import { briefOf, type Converged, converge } from "../../workflow/converge.ts";
import type { Interviewed } from "../../workflow/interview.ts";
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

export function proseTask(run: ClosingContext, reviewed: Task<Interviewed<readonly ReviewedPoint[]>>, after: readonly Task[]): Task<Converged<Prose>> {
  const voice = voiceOf(run);
  const { services } = run.app.configuration.settings;
  const channels = { slack: services.slack, jira: services.jiraWrites };
  return converge<Prose>({
    key: "prose",
    after: [reviewed, ...after],
    cache: cached(run, ["finalizer"], (context) => digest({ framing: run.framing, delivered: run.delivered, voice, channels, points: context.value(reviewed).output })),
    ...(run.events ? { events: run.events } : {}),
    make: (context, carry) =>
      withReader(run, "finalizer", { task: "prose" }, (session) =>
        ask(context, session, finalizer, {
          ticket: run.framing.ticket,
          notes: run.ledger.notes,
          arbitrages: framingArbitrages(run.framing.functional, run.framing.technical.arbitrages),
          plan: renderPlan(run.framing.plan),
          points: context.value(reviewed).output.map((point) => ({ status: point.status, text: renderReviewedPoint(point) })),
          repos: run.delivered.map((repo) => ({ repo: repo.repo, commits: repo.commits })),
          voice: voice.rules,
          calibrated: voice.calibrated,
          channels,
          feedback: briefOf(carry),
        }),
      ),
    gates: [
      {
        name: "publiable",
        budget: run.ledger.budgets.proseRepairs,
        async judge(_context, prose) {
          const problems = [
            ...(channels.slack ? publishableProblems(prose.slack).map((problem) => `message Slack : ${problem}`) : []),
            ...(channels.jira ? publishableProblems(prose.jira).map((problem) => `commentaire Jira : ${problem}`) : []),
            ...prose.mergeRequests.flatMap((entry) => publishableProblems(entry.summary).map((problem) => `MR ${entry.repo} : ${problem}`)),
          ];
          return problems.length === 0 ? { kind: "pass" } : { kind: "feedback", text: `Ces textes ne peuvent pas partir tels quels :\n${bullets(problems)}` };
        },
      },
    ],
  });
}
