import type { Logging, Workflow, WorkflowAnswer, WorkflowCheckpoint, WorkflowCheckpointStore, WorkflowEvent, WorkflowInputRequest, WorkflowResult } from "@elie-laloum/outpost";
import { type EscalationRecord, parseEscalation } from "../domain/escalation.ts";
import { describeError } from "../domain/failure.ts";
import { addTokens, NO_TOKENS, type PhaseTask, type RunEvent, type RunObserver, type RunPhase, type Tokens } from "../domain/run-events.ts";
import type { ClosingContext } from "../phases/closing/context.ts";
import { defineClosing, type Publication } from "../phases/closing/workflow.ts";
import { defineDelivery } from "../phases/delivery/workflow.ts";
import { defineFraming, type FramingOutcome } from "../phases/framing/workflow.ts";
import type { RunContext } from "../phases/run.ts";
import type { AppContext } from "./context.ts";
import { approvedOf, deliveredOf, type Ledger, publicationOf, readLedger, recordEvent, REOPEN_TARGETS, writeLedger } from "./ledger.ts";
import { storageFor } from "./storage.ts";
import { checkpointVersion } from "./version.ts";

export interface DriveRequest {
  readonly answers?: readonly WorkflowAnswer[];
  readonly resume?: boolean;
  readonly fresh?: { readonly note: string | null };
}

export type DriveOutcome =
  | { readonly status: "waiting"; readonly requests: readonly WorkflowInputRequest[] }
  | { readonly status: "escalated"; readonly escalation: EscalationRecord }
  | { readonly status: "cancelled" }
  | { readonly status: "paused"; readonly detail: string }
  | { readonly status: "done"; readonly publication: Publication };

export interface DriveOptions {
  readonly signal?: AbortSignal;
  readonly events?: RunObserver;
  readonly logging?: Logging;
  readonly version?: string;
}

const REOPEN = { amend: "plan", "reject-functional": "functional", "reject-technical": "technical" } as const;

export async function drive(app: AppContext, key: string, request: DriveRequest, options: DriveOptions = {}): Promise<DriveOutcome> {
  let ledger = readLedger(app.paths, key) ?? failMissing(key);
  let answers = request.answers;
  if (ledger.phase === "escalated") {
    if (!request.resume) return { status: "escalated", escalation: ledger.escalation ?? unknownEscalation() };
    ledger = save(app, reopenAfterEscalation(ledger, request.fresh ?? null));
  }

  while (true) {
    try {
      const next = await step(app, ledger, answers, options);
      answers = undefined;
      if ("outcome" in next) return next.outcome;
      ledger = next.ledger;
    } catch (error) {
      if (!(error instanceof Error && /incompatible workflow checkpoint/i.test(error.message)) || ledger.phase === "done" || ledger.phase === "escalated") throw error;
      const detail = `le checkpoint de ${ledger.phase} a ete ecrit par une autre version des briefs ou de redline. Reprends avec bun redline resume ${key} --fresh : les taches finies sont restituees par le cache.`;
      return escalate(app, ledger, ledger.phase, { kind: "environment", task: ledger.phase, detail, at: new Date().toISOString() });
    }
  }
}

async function step(app: AppContext, ledger: Ledger, answers: readonly WorkflowAnswer[] | undefined, options: DriveOptions): Promise<{ outcome: DriveOutcome } | { ledger: Ledger }> {
  const key = ledger.key;
  const run: RunContext = {
    app,
    ledger,
    cache: storageFor(app.paths, key).cache,
    ...(options.logging !== undefined ? { logging: options.logging } : {}),
    ...(options.events ? { events: options.events } : {}),
    ...(options.signal ? { signal: options.signal } : {}),
  };
  switch (ledger.phase) {
    case "done":
      return { outcome: { status: "done", publication: publicationOf(ledger) } };
    case "escalated":
      return { outcome: { status: "escalated", escalation: ledger.escalation ?? unknownEscalation() } };
    case "framing": {
      const framing = defineFraming(run);
      const result = await start(app, ledger, framing.workflow, { phase: "framing", runId: `${key}/framing/${ledger.framing.attempt}`, repos: [] }, answers, options);
      const halted = await halt(app, ledger, "framing", result);
      if (halted) return halted;
      const outcome = framing.outcome(result);
      const current = latest(app, ledger);
      return { ledger: save(app, outcome.decision === "approve" ? approve(current, outcome) : reopen(current, outcome)) };
    }
    case "delivery": {
      const delivery = defineDelivery({ ...run, framing: approvedOf(ledger) });
      const repos = approvedOf(ledger).plan.repos.map((repo) => repo.repo);
      const result = await start(app, ledger, delivery.workflow, { phase: "delivery", runId: `${key}/delivery/${ledger.delivery.generation}`, repos }, undefined, options);
      const halted = await halt(app, ledger, "delivery", result);
      if (halted) return halted;
      return { ledger: save(app, recordEvent({ ...latest(app, ledger), phase: "closing", delivered: delivery.outcome(result) }, "livraison terminee")) };
    }
    case "closing": {
      const context: ClosingContext = { ...run, framing: approvedOf(ledger), delivered: deliveredOf(ledger) };
      const closing = defineClosing(context);
      const repos = deliveredOf(ledger).map((repo) => repo.repo);
      const result = await start(app, ledger, closing.workflow, { phase: "closing", runId: `${key}/closing/${ledger.closing.attempt}`, repos }, undefined, options);
      const halted = await halt(app, ledger, "closing", result);
      if (halted) return halted;
      return { ledger: save(app, recordEvent({ ...latest(app, ledger), phase: "done", publication: closing.outcome(result) }, "publication terminee")) };
    }
  }
}

interface Stage {
  readonly phase: RunPhase;
  readonly runId: string;
  readonly repos: readonly string[];
}

async function start(app: AppContext, ledger: Ledger, workflow: Workflow, stage: Stage, answers: readonly WorkflowAnswer[] | undefined, options: DriveOptions): Promise<WorkflowResult> {
  const { runId } = stage;
  const checkpoints = storageFor(app.paths, ledger.key).checkpoints;
  const events = options.events;
  const earlier = Object.entries(ledger.usage).reduce((total, [other, tokens]) => (other === runId ? total : addTokens(total, tokens)), NO_TOKENS);
  save(app, { ...ledger, active: { runId, pid: process.pid } });
  let spent: Tokens | null = null;
  try {
    const result = await workflow.start({
      checkpoint: { store: events ? announcing(checkpoints, (checkpoint) => events(phaseEvent(workflow, stage, checkpoint, earlier))) : checkpoints, runId, version: options.version ?? checkpointVersion(), resume: "retry-incomplete" },
      onQuota: { action: "pause" },
      ...(answers?.length ? { answers } : {}),
      ...(options.signal ? { signal: options.signal } : {}),
      ...(events ? { observe: (event: WorkflowEvent) => events({ type: "workflow", event }) } : {}),
    });
    const { input, cached, output } = result.usage.tokens;
    spent = { input, cached, output };
    return result;
  } finally {
    const current = readLedger(app.paths, ledger.key);
    if (current) writeLedger(app.paths, { ...current, active: null, ...(spent ? { usage: { ...current.usage, [runId]: spent } } : {}) });
  }
}

/** start() records the run's usage on disk: a transition written after it builds on that ledger. */
function latest(app: AppContext, ledger: Ledger): Ledger {
  return readLedger(app.paths, ledger.key) ?? ledger;
}

/** Outpost writes the whole checkpoint once before running any task: the phase is announced from it, restored tasks included. */
function announcing(store: WorkflowCheckpointStore, announce: (checkpoint: WorkflowCheckpoint) => void): WorkflowCheckpointStore {
  return {
    async acquire(runId) {
      const lease = await store.acquire(runId);
      let announced = false;
      return {
        read: () => lease.read(),
        release: () => lease.release(),
        async write(checkpoint) {
          await lease.write(checkpoint);
          if (announced) return;
          announced = true;
          announce(checkpoint);
        },
      };
    },
  };
}

function phaseEvent(workflow: Workflow, stage: Stage, checkpoint: WorkflowCheckpoint, earlier: Tokens): RunEvent {
  const records = new Map(checkpoint.records.map((record) => [record.key, record]));
  const tasks = workflow.tasks.map((task): PhaseTask => {
    const record = records.get(task.key);
    return {
      key: task.key,
      status: record?.status ?? "waiting",
      attempts: record?.attempts ?? 0,
      startedAt: record?.startedAt ?? null,
      finishedAt: record?.finishedAt ?? null,
      cached: record?.cacheHit === true,
    };
  });
  const { input, cached, output } = checkpoint.usage.tokens;
  return { type: "phase", phase: stage.phase, tasks, repos: stage.repos, usage: { input, cached, output }, earlier };
}

async function halt(app: AppContext, ledger: Ledger, phase: "framing" | "delivery" | "closing", result: WorkflowResult): Promise<{ outcome: DriveOutcome } | null> {
  switch (result.status) {
    case "done":
      return null;
    case "waiting-input":
      return { outcome: { status: "waiting", requests: result.inputRequests } };
    case "cancelled":
      return { outcome: { status: "cancelled" } };
    case "paused":
      return { outcome: { status: "paused", detail: "quota atteint : reprends plus tard avec bun redline resume" } };
    default:
      return { outcome: escalate(app, ledger, phase, escalationOf(result, phase)) };
  }
}

function escalate(app: AppContext, ledger: Ledger, phase: "framing" | "delivery" | "closing", escalation: EscalationRecord): DriveOutcome {
  save(app, recordEvent({ ...(readLedger(app.paths, ledger.key) ?? ledger), phase: "escalated", resumePhase: phase, escalation }, `escalade ${escalation.kind} sur ${escalation.task}`));
  return { status: "escalated", escalation };
}

export function escalationOf(result: Pick<WorkflowResult, "errors" | "tasks">, phase: string): EscalationRecord {
  const messages = [...result.errors.map((error) => (error instanceof Error ? error.message : String(error))), ...result.tasks.flatMap((task) => task.error ?? [])];
  for (const message of messages) {
    const parsed = parseEscalation(message);
    if (parsed) return parsed;
  }
  const failed = result.tasks.find((task) => task.status === "failed");
  const detail = result.errors.length > 0 ? describeError(result.errors[0]) : messages[0];
  return { kind: "environment", task: failed?.key ?? phase, detail: detail ?? "echec sans message", at: new Date().toISOString() };
}

function approve(ledger: Ledger, outcome: FramingOutcome): Ledger {
  return recordEvent({ ...ledger, phase: "delivery", approved: outcome }, "plan approuve");
}

function reopen(ledger: Ledger, outcome: FramingOutcome): Ledger {
  const target = REOPEN[outcome.decision as keyof typeof REOPEN];
  const note = { target, note: outcome.note ?? "", at: new Date().toISOString() };
  return recordEvent({ ...ledger, framing: { attempt: ledger.framing.attempt + 1, reopen: [...ledger.framing.reopen, note] } }, `plan renvoye (${outcome.decision})`);
}

export function reopenAfterEscalation(ledger: Ledger, fresh: { note: string | null } | null): Ledger {
  const phase = ledger.resumePhase ?? "framing";
  const base: Ledger = { ...ledger, phase, escalation: null, resumePhase: null };
  if (!fresh) return recordEvent(base, `reprise de ${phase}`);
  const task = ledger.escalation?.task.split("/")[0] ?? "";
  switch (phase) {
    case "delivery":
      return recordEvent(
        { ...base, delivery: { generation: ledger.delivery.generation + 1, seeds: fresh.note ? { ...ledger.delivery.seeds, [task]: fresh.note } : ledger.delivery.seeds } },
        `reprise de la livraison avec un budget neuf${fresh.note ? ` : ${fresh.note}` : ""}`,
      );
    case "closing":
      return recordEvent({ ...base, closing: { attempt: ledger.closing.attempt + 1 } }, "reprise de la cloture");
    default: {
      const target = REOPEN_TARGETS.find((candidate) => candidate === task) ?? null;
      const reopen = target && fresh.note ? [...ledger.framing.reopen, { target, note: fresh.note, at: new Date().toISOString() }] : ledger.framing.reopen;
      return recordEvent({ ...base, framing: { attempt: ledger.framing.attempt + 1, reopen } }, "reprise du cadrage avec un budget neuf");
    }
  }
}

function save(app: AppContext, ledger: Ledger): Ledger {
  return writeLedger(app.paths, ledger);
}

function failMissing(key: string): never {
  throw new Error(`Aucun run pour ${key} : bun redline start ${key}`);
}

function unknownEscalation(): EscalationRecord {
  return { kind: "environment", task: "?", detail: "escalade sans detail", at: new Date().toISOString() };
}
