import { homedir } from "node:os";
import { join, resolve } from "node:path";

export interface Paths {
  readonly home: string;
  readonly settings: string;
  readonly registry: string;
  readonly env: string;
  readonly voice: string;
  readonly memory: string;
  readonly tickets: string;
  readonly runs: string;
  readonly logs: string;
  readonly figma: string;
  readonly locks: string;
  readonly tmp: string;
}

export const TEMPLATES = resolve(import.meta.dir, "..", "..", "templates");

export function expandTilde(path: string): string {
  if (path === "~") return homedir();
  return path.startsWith("~/") ? join(homedir(), path.slice(2)) : path;
}

export function homeDirectory(env: Readonly<Record<string, string | undefined>> = process.env): string {
  return env.REDLINE_HOME ? resolve(expandTilde(env.REDLINE_HOME)) : join(homedir(), ".redline");
}

export function pathsOf(home: string): Paths {
  return {
    home,
    settings: join(home, "redline.yaml"),
    registry: join(home, "repositories.yaml"),
    env: join(home, ".env"),
    voice: join(home, "voice.md"),
    memory: join(home, "memory"),
    tickets: join(home, "tickets"),
    runs: join(home, "runs"),
    logs: join(home, "logs"),
    figma: join(home, "figma"),
    locks: join(home, "locks"),
    tmp: join(home, "tmp"),
  };
}

export const ticketFile = (paths: Paths, key: string) => join(paths.tickets, `${key}.yaml`);
export const runDirectory = (paths: Paths, key: string) => join(paths.runs, key);
export const journalFile = (paths: Paths, key: string) => join(paths.runs, key, "events.jsonl");
export const lockFile = (paths: Paths, key: string) => join(paths.locks, `${key}.json`);
export const figmaDirectory = (paths: Paths, key: string) => join(paths.figma, key);
export const logDirectory = (paths: Paths, key: string) => join(paths.logs, key);
