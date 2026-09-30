import type { AgentObservation, Logging, Workflow, WorkflowAnswer, WorkflowEvent, WorkflowInputRequest, WorkflowResult } from "@elie-laloum/outpost";
import { type EscalationRecord, parseEscalation } from "../domain/escalation.ts";
import { describeError } from "../domain/failure.ts";
import type { RoleName } from "../domain/roles.ts";
import type { ClosingContext } from "../phases/closing/context.ts";
import { defineClosing, type Publication } from "../phases/closing/workflow.ts";
import type { DeliveredRepo } from "../phases/delivery/summary.ts";
import { defineDelivery } from "../phases/delivery/workflow.ts";
import { defineFraming, type FramingOutcome } from "../phases/framing/workflow.ts";
import type { RunContext } from "../phases/run.ts";
import type { AppContext } from "./context.ts";
import { type Ledger, readLedger, recordEvent, REOPEN_TARGETS, writeLedger } from "./ledger.ts";
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
  readonly observe?: (event: WorkflowEvent) => void;
  readonly agentObserve?: (role: RoleName, event: AgentObservation) => void;
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
    ...(options.agentObserve ? { observe: options.agentObserve } : {}),
    ...(options.signal ? { signal: options.signal } : {}),
  };
  switch (ledger.phase) {
    case "done":
      return { outcome: { status: "done", publication: ledger.publication as Publication } };
    case "escalated":
      return { outcome: { status: "escalated", escalation: ledger.escalation ?? unknownEscalation() } };
    case "framing": {
      const framing = defineFraming(run);
      const result = await start(app, ledger, framing.workflow, `${key}/framing/${ledger.framing.attempt}`, answers, options);
      const halted = await halt(app, ledger, "framing", result);
      if (halted) return halted;
      const outcome = framing.outcome(result);
      return { ledger: save(app, outcome.decision === "approve" ? approve(ledger, outcome) : reopen(ledger, outcome)) };
    }
    case "delivery": {
      const delivery = defineDelivery({ ...run, framing: ledger.approved as FramingOutcome });
      const result = await start(app, ledger, delivery.workflow, `${key}/delivery/${ledger.delivery.generation}`, undefined, options);
      const halted = await halt(app, ledger, "delivery", result);
      if (halted) return halted;
      return { ledger: save(app, recordEvent({ ...ledger, phase: "closing", delivered: delivery.outcome(result) }, "livraison terminee")) };
    }
    case "closing": {
      const context: ClosingContext = { ...run, framing: ledger.approved as FramingOutcome, delivered: ledger.delivered as DeliveredRepo[] };
      const closing = defineClosing(context);
      const result = await start(app, ledger, closing.workflow, `${key}/closing/${ledger.closing.attempt}`, undefined, options);
      const halted = await halt(app, ledger, "closing", result);
      if (halted) return halted;
      return { ledger: save(app, recordEvent({ ...ledger, phase: "done", publication: closing.outcome(result) }, "publication terminee")) };
    }
  }
}

async function start(app: AppContext, ledger: Ledger, workflow: Workflow, runId: string, answers: readonly WorkflowAnswer[] | undefined, options: DriveOptions): Promise<WorkflowResult> {
  save(app, { ...ledger, active: { runId, pid: process.pid } });
  try {
    return await workflow.start({
      checkpoint: { store: storageFor(app.paths, ledger.key).checkpoints, runId, version: options.version ?? checkpointVersion(), resume: "retry-incomplete" },
      onQuota: { action: "pause" },
      ...(answers?.length ? { answers } : {}),
      ...(options.signal ? { signal: options.signal } : {}),
      ...(options.observe ? { observe: options.observe } : {}),
    });
  } finally {
    const current = readLedger(app.paths, ledger.key);
    if (current) writeLedger(app.paths, { ...current, active: null });
  }
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
