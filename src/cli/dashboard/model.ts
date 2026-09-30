import type { AgentObservation, TaskStatus, WorkflowEvent } from "@elie-laloum/outpost";
import type { RoleName } from "../../domain/roles.ts";
import { type AgentSource, addTokens, NO_TOKENS, type PhaseTask, type RunEvent, type RunPhase, type Tokens } from "../../domain/run-events.ts";
import { labelOf } from "../labels.ts";
import { describeTool, formatDuration } from "./format.ts";

export const LIMITS = { journal: 400, laneText: 6000, tools: 12, minutes: 30 } as const;

export interface TaskRow {
  readonly key: string;
  readonly phase: RunPhase;
  readonly label: string;
  readonly repo: string | null;
  readonly status: TaskStatus;
  readonly attempts: number;
  readonly round: number | null;
  readonly startedAt: number | null;
  readonly finishedAt: number | null;
  readonly tokens: number;
  readonly cached: boolean;
  readonly error: string | null;
}

export interface GateState {
  readonly gate: string;
  readonly round: number;
  readonly verdict: "pass" | "feedback";
  readonly spent: number;
  readonly budget: number;
  readonly text: string | null;
}

/** What one agent said and did for a task; parallel agents of a task each get their own lane. */
export interface Lane {
  readonly id: string;
  readonly task: string;
  readonly lane: string | null;
  readonly role: RoleName;
  readonly text: string;
  readonly draft: string;
  readonly tools: readonly string[];
  readonly at: number;
}

export interface CommandRun {
  readonly label: string;
  readonly command: string;
  readonly status: "running" | "passed" | "failed";
  readonly elapsedMs: number;
  readonly exitCode: number | null;
  readonly logPath: string | null;
  readonly entry: number;
}

export type Tone = "info" | "success" | "warning" | "error";

export interface JournalEntry {
  readonly id: number;
  readonly at: number;
  readonly tone: Tone;
  readonly task: string | null;
  readonly text: string;
  readonly url: string | null;
}

export interface Dashboard {
  readonly key: string;
  readonly title: string;
  readonly startedAt: number;
  readonly now: number;
  readonly phase: RunPhase | null;
  /** Every task seen, phase by phase in run order: finished phases stay on screen. */
  readonly tasks: readonly TaskRow[];
  /** What each finished task handed the next ones, by task key. */
  readonly outputs: Readonly<Record<string, unknown>>;
  readonly repos: readonly string[];
  /** The task whose agents the human last saw start: what the inspector follows. */
  readonly active: string | null;
  /** The task whose convergence loop moved last: what the budget card shows. */
  readonly loop: string | null;
  readonly gates: Readonly<Record<string, readonly GateState[]>>;
  /** Tokens of the current phase, restored from its checkpoint then counted live. */
  readonly usage: Tokens;
  /** Tokens every earlier workflow run of the ticket spent. */
  readonly earlier: Tokens;
  readonly minutes: readonly { readonly minute: number; readonly tokens: number }[];
  readonly lanes: readonly Lane[];
  readonly commands: Readonly<Record<string, readonly CommandRun[]>>;
  readonly journal: readonly JournalEntry[];
  readonly waiting: string | null;
  readonly sequence: number;
}

const PHASES: Record<RunPhase, string> = { framing: "Cadrage", delivery: "Livraison", closing: "Cloture" };
const ORDER: readonly RunPhase[] = ["framing", "delivery", "closing"];
const PER_REPO = /^(.+)\.(workspace|tests|code(?:-\d+)?|release|summary)$/;

export function phaseLabel(phase: RunPhase): string {
  return PHASES[phase];
}

export function repoOf(key: string): string | null {
  return PER_REPO.exec(key)?.[1] ?? null;
}

export function createDashboard(ticket: { readonly key: string; readonly title: string }, now: number): Dashboard {
  return {
    key: ticket.key,
    title: ticket.title,
    startedAt: now,
    now,
    phase: null,
    tasks: [],
    outputs: {},
    repos: [],
    active: null,
    loop: null,
    gates: {},
    usage: NO_TOKENS,
    earlier: NO_TOKENS,
    minutes: [],
    lanes: [],
    commands: {},
    journal: [],
    waiting: null,
    sequence: 0,
  };
}

export function tick(state: Dashboard, now: number): Dashboard {
  return { ...state, now };
}

export function reduce(state: Dashboard, event: RunEvent, now: number): Dashboard {
  const next = { ...state, now };
  switch (event.type) {
    case "phase":
      return onPhase(next, event);
    case "past":
      return event.phase === state.phase ? next : { ...next, tasks: place(state.tasks, event.phase, event.tasks) };
    case "output":
      return { ...next, outputs: { ...state.outputs, [event.task]: event.value } };
    case "workflow":
      return onWorkflow(next, event.event, now);
    case "agent":
      return onAgent(next, event.source, event.role, event.event, now);
    case "gate": {
      const gates = (state.gates[event.task] ?? []).filter((entry) => entry.gate !== event.gate);
      const gate: GateState = { gate: event.gate, round: event.round, verdict: event.verdict, spent: event.spent, budget: event.budget, text: event.text };
      const where = `${labelOf(event.task)} · ${event.gate}`;
      const journaled =
        event.verdict === "pass"
          ? log(next, now, "success", event.task, `✓ ${where}`)
          : log(next, now, event.spent > event.budget ? "error" : "warning", event.task, `✗ ${where} refuse (${event.spent}/${event.budget})`);
      return { ...journaled, gates: { ...state.gates, [event.task]: [...gates, gate] } };
    }
    case "command":
      return onCommand(next, event, now);
    case "publication":
      return log(next, now, "success", event.task, `↗ ${event.detail}`, event.url);
  }
}

function onPhase(state: Dashboard, { phase, tasks, repos, usage, earlier }: Extract<RunEvent, { type: "phase" }>): Dashboard {
  const rows = place(state.tasks, phase, tasks);
  if (state.phase === phase) return { ...state, tasks: rows, repos, usage, earlier };
  // Gates, lanes and commands stay: a finished task keeps what its agents said.
  const fresh = { ...state, phase, tasks: rows, repos, usage, earlier, minutes: [], active: null, loop: null, waiting: null };
  return log(fresh, state.now, "info", null, `— ${phaseLabel(phase)} —`);
}

/** Replaces one phase's rows, keeping what was counted live for tasks already known, and keeps phases in run order. */
function place(rows: readonly TaskRow[], phase: RunPhase, tasks: readonly PhaseTask[]): TaskRow[] {
  const known = new Map(rows.filter((row) => row.phase === phase).map((row) => [row.key, row]));
  const placed = tasks.map((task): TaskRow => {
    const seen = known.get(task.key);
    return {
      key: task.key,
      phase,
      label: labelOf(task.key),
      repo: repoOf(task.key),
      status: task.status,
      attempts: task.attempts,
      round: seen?.round ?? null,
      startedAt: task.startedAt ? Date.parse(task.startedAt) : null,
      finishedAt: task.finishedAt ? Date.parse(task.finishedAt) : null,
      tokens: seen?.tokens ?? 0,
      cached: task.cached,
      error: seen?.error ?? null,
    };
  });
  return ORDER.flatMap((entry) => (entry === phase ? placed : rows.filter((row) => row.phase === entry)));
}

function onWorkflow(state: Dashboard, event: WorkflowEvent, now: number): Dashboard {
  const key = event.key;
  if (!key) return state;
  const at = Date.parse(event.timestamp) || now;
  const label = labelOf(key);
  switch (event.type) {
    case "task": {
      const status = event.status;
      if (!status) return state;
      const updated = patch(state, key, (row) => ({
        ...row,
        status,
        ...(event.attempt !== undefined ? { attempts: Math.max(row.attempts, event.attempt) } : {}),
        ...(status === "active" ? { startedAt: row.startedAt ?? at, finishedAt: null } : {}),
        ...(status !== "active" && status !== "waiting" && status !== "waiting-input" ? { finishedAt: at } : {}),
        ...(event.error ? { error: event.error } : {}),
      }));
      const duration = event.durationMs !== undefined ? ` — ${formatDuration(event.durationMs)}` : "";
      switch (status) {
        case "active":
          return { ...updated, active: key, ...(updated.waiting === key ? { waiting: null } : {}) };
        case "done":
          return log(updated, at, "success", key, `✓ ${label}${duration}`);
        case "failed":
          return log(updated, at, "error", key, `✗ ${label}${event.error ? ` — ${event.error}` : ""}`);
        case "cancelled":
        case "paused":
          return log(updated, at, "warning", key, `· ${label} ${status === "paused" ? "en pause" : "interrompu"}`);
        default:
          return updated;
      }
    }
    case "attempt":
      return patch(state, key, (row) => ({ ...row, attempts: Math.max(row.attempts, event.attempt ?? 0) }));
    case "loop":
      return { ...patch(state, key, (row) => ({ ...row, round: event.round ?? row.round })), loop: key };
    case "usage": {
      if (!event.usage) return state;
      const count = event.usage.input + event.usage.cached + event.usage.output;
      const usage = addTokens(state.usage, event.usage);
      return { ...patch(state, key, (row) => ({ ...row, tokens: row.tokens + count })), usage, minutes: addMinute(state.minutes, at, count) };
    }
    case "cache":
      if (event.cache !== "hit") return state;
      return log(patch(state, key, (row) => ({ ...row, cached: true })), at, "info", key, `${label} — deja fait`);
    case "retry":
      return log(state, at, "warning", key, `↻ ${label} — nouvelle tentative${event.delayMs ? ` dans ${formatDuration(event.delayMs)}` : ""}`);
    case "quota":
      return log(state, at, "warning", key, `${label} — quota atteint${event.resetAt ? `, reprise apres ${event.resetAt}` : ""}`);
    case "input-request":
      return log({ ...state, waiting: key }, at, "warning", key, `? ${label} attend ta reponse`);
    case "input-answer":
      return { ...state, waiting: state.waiting === key ? null : state.waiting };
    default:
      return state;
  }
}

function onAgent(state: Dashboard, source: AgentSource, role: RoleName, event: AgentObservation, now: number): Dashboard {
  if (event.kind !== "text" && event.kind !== "text-delta" && event.kind !== "tool") return state;
  const id = `${source.task}/${source.lane ?? ""}/${role}`;
  const existing = state.lanes.find((lane) => lane.id === id);
  const lane: Lane = existing ?? { id, task: source.task, lane: source.lane ?? null, role, text: "", draft: "", tools: [], at: now };
  const updated: Lane =
    event.kind === "text"
      ? { ...lane, text: clip(lane.text ? `${lane.text}\n\n${event.text}` : event.text), draft: "", at: now }
      : event.kind === "text-delta"
        ? { ...lane, draft: clip(lane.draft + event.text), at: now }
        : { ...lane, tools: [...lane.tools, describeTool(event.name, event.input)].slice(-LIMITS.tools), at: now };
  const lanes = existing ? state.lanes.map((entry) => (entry.id === id ? updated : entry)) : [...state.lanes, updated];
  return { ...state, lanes };
}

function onCommand(state: Dashboard, event: Extract<RunEvent, { type: "command" }>, now: number): Dashboard {
  const where = `${labelOf(event.task)} · ${event.label}`;
  const runs = state.commands[event.task] ?? [];
  const current = runs.findLast((run) => run.label === event.label && run.status === "running");
  const replace = (run: CommandRun): Dashboard => ({ ...state, commands: { ...state.commands, [event.task]: runs.map((entry) => (entry === current ? run : entry)) } });
  switch (event.status) {
    case "start": {
      const logged = log(state, now, "info", event.task, `$ ${where} : ${event.command}`);
      const run: CommandRun = { label: event.label, command: event.command, status: "running", elapsedMs: 0, exitCode: null, logPath: null, entry: logged.sequence };
      return { ...logged, commands: { ...state.commands, [event.task]: [...runs, run] } };
    }
    case "progress": {
      if (!current) return state;
      const updated = replace({ ...current, elapsedMs: event.elapsedMs });
      const text = `$ ${where} : ${current.command} (${formatDuration(event.elapsedMs)})`;
      return { ...updated, journal: updated.journal.map((entry) => (entry.id === current.entry ? { ...entry, text } : entry)) };
    }
    case "end": {
      const passed = event.passed === true;
      const exitCode = event.exitCode ?? null;
      const logPath = event.logPath ?? null;
      const ended = current ? replace({ ...current, status: passed ? "passed" : "failed", elapsedMs: event.elapsedMs, exitCode, logPath }) : state;
      const outcome = passed ? `✓ ${where} — ${formatDuration(event.elapsedMs)}` : `✗ ${where} — code ${exitCode ?? "?"} apres ${formatDuration(event.elapsedMs)}${logPath ? ` · ${logPath}` : ""}`;
      return log(ended, now, passed ? "success" : "error", event.task, outcome);
    }
  }
}

function patch(state: Dashboard, key: string, change: (row: TaskRow) => TaskRow): Dashboard {
  if (!state.tasks.some((row) => row.key === key)) return state;
  return { ...state, tasks: state.tasks.map((row) => (row.key === key ? change(row) : row)) };
}

function log(state: Dashboard, at: number, tone: Tone, task: string | null, text: string, url: string | null = null): Dashboard {
  const id = state.sequence + 1;
  return { ...state, sequence: id, journal: [...state.journal, { id, at, tone, task, text, url }].slice(-LIMITS.journal) };
}

function addMinute(minutes: Dashboard["minutes"], at: number, tokens: number): Dashboard["minutes"] {
  const minute = Math.floor(at / 60_000);
  const last = minutes.at(-1);
  if (last?.minute === minute) return [...minutes.slice(0, -1), { minute, tokens: last.tokens + tokens }];
  return [...minutes, { minute, tokens }].slice(-LIMITS.minutes);
}

function clip(text: string): string {
  return text.length > LIMITS.laneText ? text.slice(-LIMITS.laneText) : text;
}

// Selectors: what the cards and panels read, derived from the state alone.

export function progressOf(state: Dashboard): { readonly done: number; readonly total: number } {
  const current = state.tasks.filter((row) => row.phase === state.phase);
  return { done: current.filter((row) => row.status === "done" || row.status === "skipped").length, total: current.length };
}

/** Tokens of the whole ticket: every earlier workflow run plus the current one. */
export function runUsage(state: Dashboard): Tokens {
  return addTokens(state.earlier, state.usage);
}

export function usageSeries(state: Dashboard, width: number = LIMITS.minutes): number[] {
  const last = Math.floor(state.now / 60_000);
  const byMinute = new Map(state.minutes.map((entry) => [entry.minute, entry.tokens]));
  return Array.from({ length: width }, (_, index) => byMinute.get(last - width + 1 + index) ?? 0);
}

export function repoProgress(state: Dashboard): { readonly done: number; readonly total: number; readonly current: string | null } {
  const finished = (repo: string) => state.tasks.some((row) => row.key === `${repo}.summary` && row.status === "done");
  const running = state.tasks.find((row) => row.repo !== null && row.status === "active")?.repo ?? null;
  return { done: state.repos.filter(finished).length, total: state.repos.length, current: running };
}

export function lanesOf(state: Dashboard, task: string): Lane[] {
  return state.lanes.filter((lane) => lane.task === task).sort((left, right) => right.at - left.at);
}

export function commandsOf(state: Dashboard, task: string): readonly CommandRun[] {
  return state.commands[task] ?? [];
}

export function gatesOf(state: Dashboard, task: string | null): readonly GateState[] {
  return task ? (state.gates[task] ?? []) : [];
}
