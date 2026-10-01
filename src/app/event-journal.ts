import { appendFileSync, closeSync, existsSync, mkdirSync, openSync, readSync, statSync } from "node:fs";
import { dirname } from "node:path";
import type { RunEvent } from "../domain/run-events.ts";
import type { DriveOutcome } from "./driver.ts";
import { journalFile, type Paths } from "./paths.ts";

/** One line of `runs/<KEY>/events.jsonl`: an event, the start of a session, or how a session ended. */
export type JournalLine =
  | { readonly at: number; readonly event: RunEvent }
  | { readonly at: number; readonly session: { readonly pid: number } }
  | { readonly at: number; readonly outcome: DriveOutcome };

export interface JournalWriter {
  begin(pid: number): void;
  record(event: RunEvent): void;
  end(outcome: DriveOutcome): void;
  /** Writes what is still buffered; safe to call more than once. */
  close(): void;
}

export interface JournalReader {
  /** The complete lines appended since the last call; a line still being written waits for the next. */
  read(): JournalLine[];
}

/** Agent text arrives a few characters at a time: deltas are joined over this window. */
const COALESCE_MS = 250;
/** Only what the screen shows of an agent is kept, and a tool's arguments are cut. */
const SHOWN = new Set(["text", "text-delta", "tool"]);
const TOOL_FIELD_CHARS = 400;

type Delta = Extract<RunEvent, { type: "agent" }> & { readonly event: { readonly kind: "text-delta"; readonly text: string } };

export function openJournal(paths: Paths, key: string, clock: () => number = Date.now): JournalWriter {
  const file = journalFile(paths, key);
  let broken = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const drafts = new Map<string, { readonly at: number; readonly event: Delta }>();
  const outputs = new Map<string, string>();

  const write = (lines: readonly JournalLine[]) => {
    if (broken || lines.length === 0) return;
    try {
      mkdirSync(dirname(file), { recursive: true });
      appendFileSync(file, lines.map((line) => `${JSON.stringify(line)}\n`).join(""), "utf8");
    } catch {
      // The journal only feeds the screen: a run never fails on it.
      broken = true;
    }
  };
  const flush = () => {
    if (timer) clearTimeout(timer);
    timer = null;
    const pending = [...drafts.values()];
    drafts.clear();
    write(pending);
  };

  return {
    begin(pid) {
      flush();
      write([{ at: clock(), session: { pid } }]);
    },
    record(event) {
      if (event.type === "agent" && !SHOWN.has(event.event.kind)) return;
      if (isDelta(event)) {
        const id = `${event.source.task}/${event.source.lane ?? ""}/${event.role}`;
        const draft = drafts.get(id);
        drafts.set(id, draft ? { at: draft.at, event: { ...draft.event, event: { ...draft.event.event, text: draft.event.event.text + event.event.text } } } : { at: clock(), event });
        if (!timer) {
          timer = setTimeout(flush, COALESCE_MS);
          timer.unref?.();
        }
        return;
      }
      if (event.type === "output") {
        // Outpost hands every value again at each start of the workflow: one copy is enough.
        const value = JSON.stringify(event.value);
        if (outputs.get(event.task) === value) return;
        outputs.set(event.task, value);
      }
      // Deltas go first: a text that closes them must not overtake them.
      flush();
      write([{ at: clock(), event: slim(event) }]);
    },
    end(outcome) {
      flush();
      write([{ at: clock(), outcome }]);
    },
    close: flush,
  };
}

/** Appends lines as they are, for a journal started from what a run kept elsewhere. */
export function appendJournal(paths: Paths, key: string, lines: readonly JournalLine[]): void {
  if (lines.length === 0) return;
  const file = journalFile(paths, key);
  mkdirSync(dirname(file), { recursive: true });
  appendFileSync(file, lines.map((line) => `${JSON.stringify(line)}\n`).join(""), "utf8");
}

/** Every line of a ticket's journal, or null when its run has none: a run from before the journal. */
export function readJournal(paths: Paths, key: string): JournalLine[] | null {
  if (!existsSync(journalFile(paths, key))) return null;
  return followJournal(paths, key).read();
}

export function followJournal(paths: Paths, key: string): JournalReader {
  const file = journalFile(paths, key);
  let offset = 0;
  let rest = Buffer.alloc(0);
  return {
    read() {
      if (!existsSync(file)) return [];
      const size = statSync(file).size;
      if (size < offset) {
        // Deleted and written again from scratch.
        offset = 0;
        rest = Buffer.alloc(0);
      }
      if (size === offset) return [];
      const chunk = Buffer.alloc(size - offset);
      const descriptor = openSync(file, "r");
      try {
        readSync(descriptor, chunk, 0, chunk.length, offset);
      } finally {
        closeSync(descriptor);
      }
      offset = size;
      const bytes = Buffer.concat([rest, chunk]);
      const end = bytes.lastIndexOf(0x0a);
      rest = bytes.subarray(end + 1);
      if (end < 0) return [];
      return bytes
        .subarray(0, end)
        .toString("utf8")
        .split("\n")
        .flatMap((line) => {
          if (!line.trim()) return [];
          try {
            return [JSON.parse(line) as JournalLine];
          } catch {
            return [];
          }
        });
    },
  };
}

function isDelta(event: RunEvent): event is Delta {
  return event.type === "agent" && event.event.kind === "text-delta";
}

function slim(event: RunEvent): RunEvent {
  if (event.type !== "agent" || event.event.kind !== "tool") return event;
  return { ...event, event: { ...event.event, input: stringFields(event.event.input) } };
}

/** describeTool only reads a tool's string arguments, and only their start. */
function stringFields(input: unknown): Record<string, string> {
  if (typeof input !== "object" || input === null || Array.isArray(input)) return {};
  return Object.fromEntries(
    Object.entries(input).flatMap(([name, value]) => (typeof value === "string" ? [[name, value.length > TOOL_FIELD_CHARS ? `${value.slice(0, TOOL_FIELD_CHARS)}…` : value]] : [])),
  );
}
