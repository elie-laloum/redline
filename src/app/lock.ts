import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { fail } from "../domain/failure.ts";
import { lockFile, type Paths } from "./paths.ts";

export interface LockHolder {
  readonly runId: string;
  readonly pid: number;
  readonly at: string;
}

export interface TicketLock {
  readonly reclaimed: LockHolder | null;
  release(): void;
}

export function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "EPERM";
  }
}

export function readLock(paths: Paths, key: string): LockHolder | null {
  const file = lockFile(paths, key);
  if (!existsSync(file)) return null;
  try {
    return JSON.parse(readFileSync(file, "utf8")) as LockHolder;
  } catch {
    return null;
  }
}

export function acquireLock(paths: Paths, key: string, runId: string): TicketLock {
  const file = lockFile(paths, key);
  const holder = readLock(paths, key);
  if (holder && holder.pid !== process.pid && isAlive(holder.pid)) {
    fail(`${key} est deja en cours (pid ${holder.pid}, depuis ${holder.at}).`, "Attends la fin du run, ou arrete-le avant de relancer.");
  }
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify({ runId, pid: process.pid, at: new Date().toISOString() }), "utf8");
  return {
    reclaimed: holder && holder.pid !== process.pid ? holder : null,
    release: () => {
      if (readLock(paths, key)?.pid === process.pid) rmSync(file, { force: true });
    },
  };
}
