import { existsSync, type FSWatcher, watch } from "node:fs";
import type { CliRenderer } from "@opentui/core";
import { followJournal, type JournalLine } from "../../app/event-journal.ts";
import { readLedger } from "../../app/ledger.ts";
import { homeDirectory, journalFile, type Paths, pathsOf, runDirectory } from "../../app/paths.ts";
import { rebuildHistory } from "../../app/run-history.ts";
import { listRuns, runningPid } from "../../app/runs.ts";
import { fail } from "../../domain/failure.ts";
import { normalizeKey } from "../../domain/ticket.ts";
import { begin, interrupt } from "../dashboard/model.ts";
import { NO_SESSION, readSessions, type Sessions, type Watched, watched } from "../dashboard/watch.ts";
import { pickRun } from "../tui/picker.ts";
import { openTerminal } from "../tui/terminal.ts";
import { openViewer } from "../tui/viewer.ts";

/** inotify misses changes on some file systems, /mnt/c under WSL among them: a poll backs the watch up. */
const POLL_MS = 500;

export async function showCommand(input: string | undefined): Promise<number> {
  // Only the paths: show reads a run and never needs the settings or the tokens.
  const paths = pathsOf(homeDirectory());
  const key = input ? normalizeKey(input) : null;
  if (!process.stdout.isTTY || !process.stdin.isTTY) fail("show a besoin d'un terminal.", `Pour l'etat en texte : bun redline status${key ? ` ${key}` : ""}`);
  if (key && !readLedger(paths, key)) fail(`Aucun run pour ${key}.`, `Lance-le avec : bun redline start ${key}`);

  const terminal = await openTerminal();
  try {
    if (key) {
      await watchRun(terminal.renderer, paths, key, false);
      return 0;
    }
    while (true) {
      const chosen = await pickRun(terminal.renderer, () => listRuns(paths));
      if (!chosen) return 0;
      await watchRun(terminal.renderer, paths, chosen, true);
    }
  } finally {
    terminal.close();
  }
}

/** Shows one run read-only, follows it while another process drives it, and returns when the human leaves. */
async function watchRun(renderer: CliRenderer, paths: Paths, key: string, back: boolean): Promise<void> {
  const ledger = readLedger(paths, key);
  if (!ledger) return;
  const viewer = openViewer(renderer, { key, title: ledger.title }, back);
  const { board } = viewer;
  const reader = followJournal(paths, key);
  let sessions: Sessions = NO_SESSION;
  let journaled = existsSync(journalFile(paths, key));
  let shown: Watched | null = null;

  const feed = (lines: readonly JournalLine[]) => {
    for (const line of lines) {
      if ("event" in line) board.feed(line.event, line.at);
      else if ("session" in line) board.apply((state) => begin(state, line.at));
    }
    sessions = readSessions(sessions, lines);
  };
  const refresh = () => {
    const lines = reader.read();
    if (lines.length > 0) {
      journaled = true;
      feed(lines);
    }
    const now = watched({ key, sessions, running: runningPid(paths, key), journaled, ledger: () => readable(paths, key) });
    if (JSON.stringify(now) === JSON.stringify(shown)) return;
    if (now.kind === "running") {
      board.set({ ended: false, notice: null, watching: { pid: now.pid, back } });
      board.freeze(null);
    } else {
      if (now.interrupted && shown?.kind !== "ended") board.apply((state) => interrupt(state, now.at));
      board.set({ ended: true, notice: { tone: now.tone, text: now.text }, watching: { pid: null, back } });
      board.freeze(now.at);
    }
    shown = now;
  };

  // Until a session line says otherwise, the clock counts from the run's start.
  board.apply((state) => begin(state, Date.parse(ledger.startedAt)));
  if (!journaled) {
    feed(await rebuildHistory(paths, ledger));
    sessions = NO_SESSION;
  }
  refresh();

  const poll = setInterval(refresh, POLL_MS);
  let watcher: FSWatcher | null = null;
  try {
    watcher = watch(runDirectory(paths, key), { persistent: false }, refresh);
  } catch {
    // No run directory yet: the poll alone sees it appear.
  }
  try {
    await viewer.left;
  } finally {
    clearInterval(poll);
    watcher?.close();
    viewer.close();
  }
}

/** A ledger that no longer reads must not take the viewer down while it follows the run. */
function readable(paths: Paths, key: string) {
  try {
    return readLedger(paths, key);
  } catch {
    return null;
  }
}
