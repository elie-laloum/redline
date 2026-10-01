import type { DriveOutcome } from "../../app/driver.ts";
import type { JournalLine } from "../../app/event-journal.ts";
import { type Ledger, publicationOf } from "../../app/ledger.ts";
import type { RunPhase } from "../../domain/run-events.ts";
import { outcomeNotice } from "../report.ts";
import { phaseLabel, type Tone } from "./model.ts";

/** What show has read of a run's sessions so far. */
export interface Sessions {
  /** The pid of the last session to start. */
  readonly pid: number | null;
  /** How that session ended, once it has. */
  readonly outcome: DriveOutcome | null;
  /** The time of the last line read. */
  readonly at: number | null;
}

export const NO_SESSION: Sessions = { pid: null, outcome: null, at: null };

export function readSessions(sessions: Sessions, lines: readonly JournalLine[]): Sessions {
  return lines.reduce<Sessions>((current, line) => {
    if ("session" in line) return { pid: line.session.pid, outcome: null, at: line.at };
    if ("outcome" in line) return { ...current, outcome: line.outcome, at: line.at };
    return { ...current, at: line.at };
  }, sessions);
}

export type Watched =
  | { readonly kind: "running"; readonly pid: number }
  | {
      readonly kind: "ended";
      readonly tone: Tone;
      readonly text: string;
      readonly at: number;
      /** The process died without ending its tasks: those it was running are shown interrupted. */
      readonly interrupted: boolean;
    };

export interface WatchInput {
  readonly key: string;
  readonly sessions: Sessions;
  /** The pid holding the ticket's lock, while that process lives. */
  readonly running: number | null;
  /** False for a run from before the journal. */
  readonly journaled: boolean;
  readonly ledger: () => Ledger | null;
}

/** Whether a watched run is running, and how it ended otherwise. */
export function watched({ key, sessions, running, journaled, ledger }: WatchInput): Watched {
  const resume = `Reprends avec : bun redline resume ${key}`;
  if (sessions.outcome) return { kind: "ended", ...outcomeNotice(key, sessions.outcome), at: sessions.at ?? Date.now(), interrupted: false };
  if (running !== null) return { kind: "running", pid: running };
  if (journaled && sessions.pid !== null) {
    return { kind: "ended", tone: "warning", text: `Le run s'est arrete sans fin propre (pid ${sessions.pid}). ${resume}`, at: sessions.at ?? Date.now(), interrupted: true };
  }
  const current = ledger();
  if (!current) return { kind: "ended", tone: "warning", text: `Le run de ${key} a ete supprime.`, at: sessions.at ?? Date.now(), interrupted: true };
  const at = Date.parse(current.updatedAt);
  const notice = fromLedger(key, current, resume);
  const prefix = journaled ? "" : "Run anterieur au journal : ni texte d'agent ni journal.\n";
  return { kind: "ended", tone: notice.tone, text: `${prefix}${notice.text}`, at, interrupted: current.phase !== "done" && current.phase !== "escalated" };
}

function fromLedger(key: string, ledger: Ledger, resume: string): { readonly tone: Tone; readonly text: string } {
  switch (ledger.phase) {
    case "done":
      try {
        return outcomeNotice(key, { status: "done", publication: publicationOf(ledger) });
      } catch {
        return { tone: "success", text: `${key} publie.` };
      }
    case "escalated":
      return ledger.escalation ? outcomeNotice(key, { status: "escalated", escalation: ledger.escalation }) : { tone: "error", text: `Escalade. ${resume}` };
    default:
      return { tone: "warning", text: `Arrete en ${phaseLabel(ledger.phase as RunPhase).toLowerCase()}. ${resume}` };
  }
}
