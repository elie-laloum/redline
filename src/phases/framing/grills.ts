import type { Task, TaskContext } from "@elie-laloum/outpost";
import { functionalGrill } from "../../agents/functional-grill.ts";
import { arbitrages as renderArbitrages } from "../../agents/render.ts";
import { ask } from "../../agents/role.ts";
import type { GrillReply } from "../../agents/shared.ts";
import { technicalGrill } from "../../agents/technical-grill.ts";
import { findRepo } from "../../domain/config.ts";
import { digest } from "../../domain/digest.ts";
import type { Contradiction, Scope } from "../../domain/scope.ts";
import type { TicketSnapshot } from "../../domain/ticket.ts";
import { defineInterview, type Interviewed, type Turn } from "../../workflow/interview.ts";
import { HUMAN, type RunContext, withReader } from "../run.ts";
import { renderConventions } from "./conventions.ts";
import { type FigmaBrief, renderFigma } from "./figma.ts";
import type { MemoryBrief } from "./memory.ts";

export interface Arbitrage {
  readonly question: string;
  readonly answer: string;
  readonly why: string;
}

export interface GrillOutcome {
  readonly arbitrages: readonly Arbitrage[];
  readonly contradictions: readonly Contradiction[];
}

function toTurn(reply: GrillReply, raisedBy: string): Turn<GrillOutcome> {
  if (!reply.done) return { ask: reply.questions };
  return { done: { arbitrages: reply.arbitrages, contradictions: reply.contradictions.map((entry) => ({ ...entry, raisedBy })) } };
}

function reopenNote(run: RunContext, target: "functional" | "technical"): string | null {
  return run.ledger.framing.reopen.filter((entry) => entry.target === target).at(-1)?.note ?? null;
}

export function renderGrill(outcome: GrillOutcome): string {
  return renderArbitrages(outcome.arbitrages);
}

export function functionalInterview(run: RunContext, deps: { ticket: Task<TicketSnapshot>; figma: Task<FigmaBrief>; memory: Task<MemoryBrief> }): Task<Interviewed<GrillOutcome>> {
  const { settings } = run.app.configuration;
  const reopen = run.ledger.framing.reopen.filter((entry) => entry.target === "functional").map((entry) => entry.note);
  return defineInterview<GrillOutcome>({
    key: "functional",
    workflow: "redline.framing",
    title: "Grill fonctionnel",
    actors: [HUMAN],
    after: [deps.ticket, deps.figma, deps.memory],
    maxTurns: run.ledger.budgets.grillRounds,
    memo: {
      store: run.cache,
      version: "functional-1",
      key: (context: TaskContext) => digest({ ticket: context.value(deps.ticket), notes: run.ledger.notes, figma: context.value(deps.figma).frames.map((frame) => frame.url), reopen }),
    },
    think: (context, transcript, turn) =>
      withReader(
        run,
        "functional-grill",
        { task: "functional" },
        async (session) => {
          const reply = await ask(context, session, functionalGrill, {
            ticket: context.value(deps.ticket),
            notes: run.ledger.notes,
            figma: renderFigma(context.value(deps.figma), run.ledger.key),
            memory: context.value(deps.memory).rendered,
            transcript,
            turn,
            maxTurns: settings.budgets.grillRounds,
            reopen: reopenNote(run, "functional"),
          });
          return toTurn(reply, "functional-grill");
        },
        [`figma/${run.ledger.key}`],
      ),
  });
}

export function technicalInterview(
  run: RunContext,
  deps: { ticket: Task<TicketSnapshot>; functional: Task<Interviewed<GrillOutcome>>; scope: Task<{ scope: Scope }>; memory: Task<MemoryBrief> },
): Task<Interviewed<GrillOutcome>> {
  const { registry } = run.app.configuration;
  const reopen = run.ledger.framing.reopen.filter((entry) => entry.target === "technical").map((entry) => entry.note);
  return defineInterview<GrillOutcome>({
    key: "technical",
    workflow: "redline.framing",
    title: "Grill technique",
    actors: [HUMAN],
    after: [deps.ticket, deps.functional, deps.scope, deps.memory],
    maxTurns: run.ledger.budgets.grillRounds,
    memo: {
      store: run.cache,
      version: "technical-1",
      key: (context: TaskContext) => digest({ functional: context.value(deps.functional).output, scope: context.value(deps.scope).scope, reopen }),
    },
    think: (context, transcript, turn) =>
      withReader(run, "technical-grill", { task: "technical" }, async (session, reader) => {
        const scope = context.value(deps.scope).scope;
        const repos = scope.impacted.flatMap((entry) => findRepo(registry, entry.repo) ?? []);
        const reply = await ask(context, session, technicalGrill, {
          ticket: context.value(deps.ticket),
          notes: run.ledger.notes,
          functional: renderGrill(context.value(deps.functional).output),
          scope: renderScope(scope, reader.repoPath),
          conventions: renderConventions(repos, reader),
          memory: context.value(deps.memory).rendered,
          transcript,
          turn,
          maxTurns: run.ledger.budgets.grillRounds,
          reopen: reopenNote(run, "technical"),
        });
        return toTurn(reply, "technical-grill");
      }),
  });
}

export function renderScope(scope: Scope, repoPath: (name: string) => string = (name) => name): string {
  const impacted = scope.impacted.map((entry) => `- ${entry.repo} (level ${entry.level}, ${repoPath(entry.repo)}) — ${entry.area}\n${entry.evidence.map((line) => `  - ${line}`).join("\n")}`);
  const excluded = scope.excluded.map((entry) => `- ${entry.repo} : ${entry.reason}`);
  return [`Impactes :`, ...impacted, "", "Ecartes :", ...(excluded.length ? excluded : ["(aucun)"])].join("\n");
}
