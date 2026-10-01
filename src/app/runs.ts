import { existsSync, readdirSync } from "node:fs";
import { type Phase, readLedger } from "./ledger.ts";
import { isAlive, readLock } from "./lock.ts";
import type { Paths } from "./paths.ts";

export interface RunSummary {
  readonly key: string;
  readonly title: string;
  readonly phase: Phase;
  readonly escalation: string | null;
  readonly updatedAt: string;
  /** The pid of the process running the ticket, while it is alive. */
  readonly running: number | null;
}

/** Every run of the home, running ones first, then the most recently touched. A ledger that no longer reads is left out. */
export function listRuns(paths: Paths): RunSummary[] {
  if (!existsSync(paths.tickets)) return [];
  const keys = readdirSync(paths.tickets).filter((name) => name.endsWith(".yaml")).map((name) => name.replace(/\.yaml$/, ""));
  const runs = keys.flatMap((key): RunSummary[] => {
    try {
      const ledger = readLedger(paths, key);
      if (!ledger) return [];
      return [{ key, title: ledger.title, phase: ledger.phase, escalation: ledger.escalation?.kind ?? null, updatedAt: ledger.updatedAt, running: runningPid(paths, key) }];
    } catch {
      return [];
    }
  });
  return runs.sort((left, right) => Number(right.running !== null) - Number(left.running !== null) || right.updatedAt.localeCompare(left.updatedAt));
}

/** A run is running while the process holding its ticket lives: ledger.active is null while it waits for an answer. */
export function runningPid(paths: Paths, key: string): number | null {
  const holder = readLock(paths, key);
  return holder && isAlive(holder.pid) ? holder.pid : null;
}
