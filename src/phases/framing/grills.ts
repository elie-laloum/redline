import type { Task, TaskContext } from "@elie-laloum/outpost/workflows";
import { functionalGrill } from "../../agents/functional-grill.ts";
import { functionalFraming } from "../../agents/render.ts";
import { ask } from "../../agents/role.ts";
import type { Divergence, FunctionalGrillReply, TechnicalGrillReply } from "../../agents/shared.ts";
import { technicalGrill } from "../../agents/technical-grill.ts";
import { findRepo } from "../../domain/config.ts";
import {
  ACCEPT_DEROGATION,
  type Derogation,
  derogationQuestionId,
  derogationRulings,
  GROUND_LABELS,
  REFUSE_DEROGATION,
  refusedDerogations,
} from "../../domain/derogation.ts";
import type { DescriptionEdit } from "../../domain/description-edits.ts";
import { digest } from "../../domain/digest.ts";
import { divergenceStatus, RESPONDENT_CHOICES, RESPONDENT_QUESTION_ID, type Respondent, respondentOf, storyFate } from "../../domain/respondent.ts";
import type { Contradiction, Scope } from "../../domain/scope.ts";
import type { TicketSnapshot } from "../../domain/ticket.ts";
import { defineInterview, type Exchange, type Interviewed, type Question, type Turn } from "../../workflow/interview.ts";
import { HUMAN, type RunContext, withReader } from "../run.ts";
import { renderConventions } from "./conventions.ts";
import { type FigmaBrief, renderFigma } from "./figma.ts";
import type { MemoryBrief } from "./memory.ts";

export interface Arbitrage {
  readonly question: string;
  readonly answer: string;
  readonly why: string;
  /** On a technical arbitrage only: the functional arbitrage it departs from, which the human accepted. */
  readonly overrides?: Derogation | null | undefined;
}

export interface GrillOutcome {
  readonly arbitrages: readonly Arbitrage[];
  readonly contradictions: readonly Contradiction[];
}

export interface FunctionalOutcome extends GrillOutcome {
  /** Where the framing departs from the ticket, which it prevails over. */
  readonly divergences: readonly Divergence[];
  /** The passages of the ticket the framing rewrites; the rest of the ticket stays as it is. */
  readonly edits: readonly DescriptionEdit[];
  readonly respondent: Respondent | null;
}

function toTurn(reply: TechnicalGrillReply, raisedBy: string): Turn<GrillOutcome> {
  if (!reply.done) return { ask: reply.questions };
  return { done: { arbitrages: reply.arbitrages, contradictions: reply.contradictions.map((entry) => ({ ...entry, raisedBy })) } };
}

const RESPONDENT_QUESTION: Question = {
  id: RESPONDENT_QUESTION_ID,
  header: "Qui repond",
  text: "Qui repond aux questions du cadrage fonctionnel ? Les reponses du PO remplacent la description de l'US dans Jira a la cloture ; les tiennes restent une alternative, en attente de sa validation, et la fiche Jira n'est pas modifiee.",
  options: Object.keys(RESPONDENT_CHOICES),
  freeText: false,
};

/** Who answers is asked once, ahead of the grill's first questions: a grill that asks nothing involves no one. */
function functionalTurn(reply: FunctionalGrillReply, transcript: readonly Exchange[]): Turn<FunctionalOutcome> {
  if (!reply.done) return { ask: respondentOf(transcript) ? reply.questions : [RESPONDENT_QUESTION, ...reply.questions] };
  return {
    done: {
      arbitrages: reply.arbitrages,
      divergences: reply.divergences,
      edits: reply.edits,
      respondent: respondentOf(transcript),
      contradictions: reply.contradictions.map((entry) => ({ ...entry, raisedBy: "functional-grill" })),
    },
  };
}

function reopenNote(run: RunContext, target: "functional" | "technical"): string | null {
  return run.ledger.framing.reopen.filter((entry) => entry.target === target).at(-1)?.note ?? null;
}

export function renderGrill(outcome: FunctionalOutcome): string {
  return functionalFraming(outcome);
}

export function renderDivergences(outcome: FunctionalOutcome): string[] {
  return outcome.divergences.map((entry) => `- L'US dit : ${entry.said} → decide : ${entry.decided} (${entry.why})`);
}

/** The divergences and the edits to the ticket, as the human reviews them with the plan; empty when the grill left the ticket as it was. */
export function renderStoryEdits(outcome: FunctionalOutcome): string[] {
  const divergences = outcome.divergences.length ? [`Divergences avec l'US (${divergenceStatus(outcome.respondent)}) :`, ...renderDivergences(outcome), ""] : [];
  const edits = outcome.edits.length
    ? [`Passages de l'US reecrits — ${storyFate(outcome.respondent)}`, ...outcome.edits.map((edit) => `- « ${edit.before} » → « ${edit.after} »`), ""]
    : [];
  return [...divergences, ...edits];
}

/**
 * A derogation is the human's to rule on, never the grill's: each one the transcript has not ruled
 * on yet becomes a question, asked before the grill may conclude.
 */
export function derogationQuestions(reply: TechnicalGrillReply, functional: readonly Arbitrage[], transcript: readonly Exchange[]): Question[] {
  const ruled = derogationRulings(transcript);
  return reply.arbitrages.flatMap((entry): Question[] => {
    if (!entry.overrides || ruled.has(entry.overrides.functional)) return [];
    const target = functional[Number(entry.overrides.functional.slice(1)) - 1];
    return [
      {
        id: derogationQuestionId(entry.overrides.functional),
        header: `Derogation a ${entry.overrides.functional}`,
        text: [
          `Le grill technique propose de deroger a un arbitrage fonctionnel, qui fait foi.`,
          "",
          `${entry.overrides.functional} : ${target ? `${target.question} → ${target.answer}` : "(introuvable)"}`,
          `Proposition technique : ${entry.question} → ${entry.answer}`,
          `Motif (${GROUND_LABELS[entry.overrides.ground]}) : ${entry.why}`,
          "",
          "Accepter la consigne dans le plan comme une derogation ; refuser oblige le technique a trouver une autre voie.",
        ].join("\n"),
        options: [ACCEPT_DEROGATION, REFUSE_DEROGATION],
        freeText: false,
      },
    ];
  });
}

export function functionalInterview(run: RunContext, deps: { ticket: Task<TicketSnapshot>; figma: Task<FigmaBrief>; memory: Task<MemoryBrief> }): Task<Interviewed<FunctionalOutcome>> {
  const { settings } = run.app.configuration;
  const reopen = run.ledger.framing.reopen.filter((entry) => entry.target === "functional").map((entry) => entry.note);
  return defineInterview<FunctionalOutcome>({
    key: "functional",
    workflow: "redline.framing",
    title: "Grill fonctionnel",
    actors: [HUMAN],
    after: [deps.ticket, deps.figma, deps.memory],
    maxTurns: run.ledger.budgets.grillRounds,
    memo: {
      store: run.cache,
      version: "functional-2",
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
          return functionalTurn(reply, transcript);
        },
        [`figma/${run.ledger.key}`],
      ),
  });
}

export function technicalInterview(
  run: RunContext,
  deps: { ticket: Task<TicketSnapshot>; functional: Task<Interviewed<FunctionalOutcome>>; scope: Task<{ scope: Scope }>; memory: Task<MemoryBrief> },
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
      version: "technical-2",
      key: (context: TaskContext) => digest({ functional: context.value(deps.functional).output, scope: context.value(deps.scope).scope, reopen }),
    },
    think: (context, transcript, turn) =>
      withReader(run, "technical-grill", { task: "technical" }, async (session, reader) => {
        const scope = context.value(deps.scope).scope;
        const repos = scope.impacted.flatMap((entry) => findRepo(registry, entry.repo) ?? []);
        const { arbitrages: functional, divergences } = context.value(deps.functional).output;
        const reply = await ask(context, session, technicalGrill, {
          ticket: context.value(deps.ticket),
          notes: run.ledger.notes,
          functional,
          divergences,
          refused: refusedDerogations(transcript),
          scope: renderScope(scope, reader.repoPath),
          conventions: renderConventions(repos, reader),
          memory: context.value(deps.memory).rendered,
          transcript,
          turn,
          maxTurns: run.ledger.budgets.grillRounds,
          reopen: reopenNote(run, "technical"),
        });
        const derogations = reply.done ? derogationQuestions(reply, functional, transcript) : [];
        return derogations.length ? { ask: derogations } : toTurn(reply, "technical-grill");
      }),
  });
}

export function renderScope(scope: Scope, repoPath: (name: string) => string = (name) => name): string {
  const impacted = scope.impacted.map((entry) => `- ${entry.repo} (level ${entry.level}, ${repoPath(entry.repo)}) — ${entry.area}\n${entry.evidence.map((line) => `  - ${line}`).join("\n")}`);
  const excluded = scope.excluded.map((entry) => `- ${entry.repo} : ${entry.reason}`);
  return [`Impactes :`, ...impacted, "", "Ecartes :", ...(excluded.length ? excluded : ["(aucun)"])].join("\n");
}
