import type { Task } from "@elie-laloum/outpost";
import { planner } from "../../agents/planner.ts";
import { bullets } from "../../agents/render.ts";
import { ask } from "../../agents/role.ts";
import { declaredTestKinds, findRepo, type RepoEntry } from "../../domain/config.ts";
import { digest } from "../../domain/digest.ts";
import { type Plan, planProblems } from "../../domain/plan.ts";
import type { TicketSnapshot } from "../../domain/ticket.ts";
import { type Converged, converge } from "../../workflow/converge.ts";
import type { Interviewed } from "../../workflow/interview.ts";
import { cached, type RunContext, withReader } from "../run.ts";
import { type GrillOutcome, renderGrill, renderScope } from "./grills.ts";
import type { MemoryBrief } from "./memory.ts";
import type { ScopeOutcome } from "./scope.ts";

export function renderCapabilities(repos: readonly RepoEntry[]): string {
  return repos
    .map((repo) => `- ${repo.name} : tests ${declaredTestKinds(repo).join(", ") || "aucun (withoutTests)"} ; lint ${repo.commands.lint ? "oui" : "non"} ; typecheck ${repo.commands.typecheck ? "oui" : "non"}`)
    .join("\n");
}

export function planTask(
  run: RunContext,
  deps: {
    ticket: Task<TicketSnapshot>;
    functional: Task<Interviewed<GrillOutcome>>;
    technical: Task<Interviewed<GrillOutcome>>;
    scope: Task<ScopeOutcome>;
    memory: Task<MemoryBrief>;
  },
): Task<Converged<Plan>> {
  const { registry, settings } = run.app.configuration;
  const amendments = run.ledger.framing.reopen.filter((entry) => entry.target === "plan").map((entry) => entry.note);
  return converge<Plan>({
    key: "plan",
    after: [deps.ticket, deps.functional, deps.technical, deps.scope, deps.memory],
    cache: cached(run, ["planner"], (context) =>
      digest({ ticket: context.value(deps.ticket), functional: context.value(deps.functional), technical: context.value(deps.technical), scope: context.value(deps.scope).scope, amendments }),
    ),
    ...(run.events ? { events: run.events } : {}),
    seed: () => (amendments.length ? `L'humain a demande d'amender le plan :\n${bullets(amendments)}` : null),
    make: (context, carry) =>
      withReader(run, "planner", { task: "plan" }, (session, reader) => {
        const scope = context.value(deps.scope).scope;
        const repos = scope.impacted.flatMap((entry) => findRepo(registry, entry.repo) ?? []);
        return ask(context, session, planner, {
          ticket: context.value(deps.ticket),
          notes: run.ledger.notes,
          functional: renderGrill(context.value(deps.functional).output),
          functionalExchanges: context.value(deps.functional).transcript,
          technical: renderGrill(context.value(deps.technical).output),
          technicalExchanges: context.value(deps.technical).transcript,
          scope: renderScope(scope, reader.repoPath),
          repos: renderCapabilities(repos),
          types: settings.naming.types,
          memory: context.value(deps.memory).rendered,
          feedback: carry.feedback?.text ?? null,
        });
      }),
    gates: [
      {
        name: "validite",
        budget: run.ledger.budgets.planRepairs,
        async judge(context, plan) {
          const scope = context.value(deps.scope).scope;
          const problems = planProblems(plan, {
            criteria: context.value(deps.ticket).criteria,
            scope: scope.impacted,
            repos: registry.repositories,
            types: settings.naming.types,
          });
          return problems.length === 0 ? { kind: "pass" } : { kind: "feedback", text: `Le plan ne tient pas les regles :\n${bullets(problems)}` };
        },
      },
    ],
  });
}
