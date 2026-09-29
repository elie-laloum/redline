import { defineTask, type Task, type TaskContext, type WorkflowInputQuestion, type WorkflowJson } from "@elie-laloum/outpost";
import { Escalation } from "./escalation.ts";
import { createMemo, type MemoOptions } from "./memo.ts";

export interface Question {
  readonly id: string;
  readonly header: string;
  readonly text: string;
  readonly options: readonly string[];
  readonly freeText?: boolean;
}

export interface Exchange {
  readonly question: Question;
  readonly answer: string;
  readonly answeredAt: string;
}

export type Turn<O> = { readonly ask: readonly Question[] } | { readonly done: O };

export interface Interviewed<O> {
  readonly output: O;
  readonly transcript: readonly Exchange[];
}

export interface InterviewOptions<O> {
  readonly key: string;
  readonly workflow: string;
  readonly title: string;
  readonly actors: readonly string[];
  readonly after?: readonly Task[];
  readonly maxTurns: number;
  readonly think: (context: TaskContext, transcript: readonly Exchange[], turn: number) => Promise<Turn<O>>;
  readonly memo?: MemoOptions;
}

interface InterviewState {
  readonly turn: number;
  readonly transcript: readonly Exchange[];
  readonly pending: readonly Question[];
  readonly consumed: string | null;
}

export function defineInterview<O>(options: InterviewOptions<O>): Task<Interviewed<O>> {
  const memo = options.memo ? createMemo(options.workflow, options.key, options.memo) : null;
  return defineTask<Interviewed<O>>({
    key: options.key,
    after: options.after,
    interaction: { identity: `redline.${options.key}`, actors: [...options.actors] },
    async perform(context) {
      const remembered = await memo?.recall(context);
      if (remembered !== undefined) return remembered as unknown as Interviewed<O>;
      const interaction = context.interaction ?? fail(options.key);
      let state = absorb((interaction.state as InterviewState | undefined) ?? { turn: 0, transcript: [], pending: [], consumed: null }, interaction.answer);
      while (true) {
        const next = state.pending[0];
        if (next) interaction.suspend(render(options.title, next, state), state as unknown as WorkflowJson);
        const turn = await options.think(context, state.transcript, state.turn + 1);
        if ("done" in turn) {
          const result: Interviewed<O> = { output: turn.done, transcript: state.transcript };
          await memo?.remember(context, result as unknown as WorkflowJson);
          return result;
        }
        if (state.turn >= options.maxTurns) {
          throw new Escalation("convergence", options.key, `${options.maxTurns} lot(s) de questions sans conclusion.`);
        }
        state = { ...state, turn: state.turn + 1, pending: turn.ask.map(sanitize) };
      }
    },
  });
}

function absorb(state: InterviewState, answer: { requestId: string; value: string; answeredAt: string } | undefined): InterviewState {
  const [asked, ...rest] = state.pending;
  if (!answer || !asked || answer.requestId === state.consumed) return state;
  return {
    ...state,
    pending: rest,
    consumed: answer.requestId,
    transcript: [...state.transcript, { question: asked, answer: answer.value.trim(), answeredAt: answer.answeredAt }],
  };
}

function render(title: string, question: Question, state: InterviewState): WorkflowInputQuestion {
  const position = state.transcript.length + 1;
  const total = state.transcript.length + state.pending.length;
  const choices = question.options.length >= 2 ? [...question.options] : undefined;
  return {
    question: `${title} · ${position}/${total} — ${question.header}\n\n${question.text}`,
    ...(choices ? { choices } : {}),
    allowFreeText: question.freeText ?? true,
  };
}

function sanitize(question: Question): Question {
  const options = [...new Set(question.options.map((option) => option.trim()).filter(Boolean))];
  const freeText = options.length < 2 ? true : question.freeText;
  return { id: question.id, header: question.header.trim() || question.id, text: question.text.trim(), options, ...(freeText === undefined ? {} : { freeText }) };
}

function fail(key: string): never {
  throw new Error(`${key} : tache d'interview sans contexte d'interaction.`);
}
