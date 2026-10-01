import { existsSync } from "node:fs";
import type { WorkflowCheckpoint, WorkflowEvent } from "@elie-laloum/outpost";
import { addTokens, NO_TOKENS, type PublicationAction, type RunEvent, type RunPhase } from "../domain/run-events.ts";
import type { Carry } from "../workflow/converge.ts";
import { phaseTask } from "./driver.ts";
import { appendJournal, type JournalLine, readJournal } from "./event-journal.ts";
import { type Ledger, runIdOf } from "./ledger.ts";
import { journalFile, type Paths } from "./paths.ts";
import { readCheckpoint, storageFor } from "./storage.ts";

export interface RunHistory {
  readonly lines: readonly JournalLine[];
  /** False for a run from before the journal: its lines are rebuilt from its ledger and checkpoints. */
  readonly journaled: boolean;
}

const ORDER: readonly RunPhase[] = ["framing", "delivery", "closing"];

export async function loadHistory(paths: Paths, ledger: Ledger): Promise<RunHistory> {
  const lines = readJournal(paths, ledger.key);
  if (lines) return { lines, journaled: true };
  return { lines: await rebuildHistory(paths, ledger), journaled: false };
}

/** A run from before the journal starts one with what its checkpoints still hold, so show sees all of it. */
export async function seedJournal(paths: Paths, ledger: Ledger): Promise<void> {
  if (existsSync(journalFile(paths, ledger.key))) return;
  appendJournal(paths, ledger.key, await rebuildHistory(paths, ledger));
}

/**
 * What the checkpoints still hold of a run that kept no journal: every phase with its tasks and
 * their durations, what they handed on, their errors, the gate feedback of refused rounds and the
 * public actions. Agent text, commands and passed verdicts are gone.
 */
export async function rebuildHistory(paths: Paths, ledger: Ledger): Promise<JournalLine[]> {
  const storage = storageFor(paths, ledger.key);
  const lines: JournalLine[] = [];
  for (const phase of ORDER) {
    const runId = runIdOf(ledger, phase);
    const checkpoint = await readCheckpoint(storage, runId).catch(() => null);
    if (!checkpoint) continue;
    const tasks = checkpoint.records.map(phaseTask);
    const at = Math.min(...tasks.flatMap((task) => (task.startedAt ? [Date.parse(task.startedAt)] : [])), Date.parse(ledger.updatedAt));
    const earlier = Object.entries(ledger.usage).reduce((total, [other, tokens]) => (other === runId ? total : addTokens(total, tokens)), NO_TOKENS);
    const { input, cached, output } = checkpoint.usage.tokens;
    lines.push({ at, event: { type: "phase", phase, tasks, repos: reposOf(ledger, phase), usage: { input, cached, output }, earlier } });
    const records = [...checkpoint.records].sort((left, right) => timeOf(left.finishedAt ?? left.startedAt, at) - timeOf(right.finishedAt ?? right.startedAt, at));
    for (const record of records) lines.push(...readBack(ledger, phase, record, timeOf(record.finishedAt ?? record.startedAt, at)));
    for (const record of records) {
      const saved = checkpoint.values[record.key];
      if (!saved) continue;
      const value = saved.kind === "json" ? saved.value : null;
      const done = timeOf(record.finishedAt, at);
      lines.push({ at: done, event: { type: "output", task: record.key, value } });
      for (const event of publicationsOf(ledger, record.key, value)) lines.push({ at: done, event });
    }
  }
  return lines;
}

function readBack(ledger: Ledger, phase: RunPhase, record: WorkflowCheckpoint["records"][number], at: number): JournalLine[] {
  const lines: JournalLine[] = [];
  const workflow = (type: WorkflowEvent["type"], extra: Partial<WorkflowEvent>): JournalLine => ({
    at,
    event: { type: "workflow", event: { executionId: "", workflow: `redline.${phase}`, timestamp: new Date(at).toISOString(), type, key: record.key, ...extra } },
  });
  const rounds = record.rounds ?? [];
  for (const round of rounds) {
    const carry = round.check && !round.check.done ? carryOf(round.check.feedback) : null;
    if (!carry?.feedback) continue;
    const { gate, text } = carry.feedback;
    lines.push({ at, event: { type: "gate", task: record.key, gate, round: carry.round - 1, verdict: "feedback", spent: carry.spent[gate] ?? 0, budget: null, text } });
  }
  if (rounds.length > 0) lines.push(workflow("loop", { round: Math.max(...rounds.map((round) => round.round)) }));
  if (record.finishedAt || record.error) {
    const started = record.startedAt ? Date.parse(record.startedAt) : null;
    lines.push(workflow("task", { status: record.status, ...(record.error ? { error: record.error } : {}), ...(started !== null && record.finishedAt ? { durationMs: Date.parse(record.finishedAt) - started } : {}) }));
  }
  return lines;
}

/** A converge loop's refusal carries the next round's state as JSON; other loops carry text. */
function carryOf(feedback: string): Carry | null {
  try {
    const carry = JSON.parse(feedback) as Partial<Carry>;
    return typeof carry.round === "number" && typeof carry.spent === "object" && carry.spent !== null ? (carry as Carry) : null;
  } catch {
    return null;
  }
}

function reposOf(ledger: Ledger, phase: RunPhase): string[] {
  const source = phase === "delivery" ? (ledger.approved as { plan?: { repos?: { repo?: unknown }[] } } | null)?.plan?.repos : phase === "closing" ? (ledger.delivered as { repo?: unknown }[] | null) : null;
  return (source ?? []).flatMap((entry) => (typeof entry.repo === "string" ? [entry.repo] : []));
}

function timeOf(iso: string | undefined, fallback: number): number {
  return (iso ? Date.parse(iso) : Number.NaN) || fallback;
}

/** The public actions a finished task's value records, worded as the live events word them. */
function publicationsOf(ledger: Ledger, task: string, value: unknown): RunEvent[] {
  const publication = (action: PublicationAction, detail: string, url: string | null = null): RunEvent => ({ type: "publication", task, action, detail, url });
  const fields = typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
  const items = Array.isArray(value) ? (value as unknown[]) : [];
  if (task.endsWith(".release")) return typeof fields?.tag === "string" ? [publication("tag", `tag ${fields.tag} pousse`)] : [];
  switch (task) {
    case "push-branches":
      return items.flatMap((branch) => (typeof branch === "string" ? [publication("push", `${branch} pousse`)] : []));
    case "merge-requests":
      return items.flatMap((item) => {
        const request = item as { repo?: unknown; url?: unknown };
        return typeof request.repo === "string" && typeof request.url === "string" ? [publication("merge-request", `${request.repo} : MR ouverte`, request.url)] : [];
      });
    case "slack": {
      const name = (fields?.channel as { name?: unknown } | undefined)?.name;
      return typeof name === "string" ? [publication("slack", `message poste dans #${name}`)] : [];
    }
    case "jira":
      return [
        ...(typeof fields?.transition === "string" ? [publication("jira", `${ledger.key} passe en ${fields.transition}`, ledger.url)] : []),
        ...(fields?.commented === true ? [publication("jira", `commentaire poste sur ${ledger.key}`, ledger.url)] : []),
      ];
    default:
      return [];
  }
}
