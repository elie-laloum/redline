import { copyFileSync, existsSync, mkdirSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import type { Paths } from "./paths.ts";

export interface MigrationReport {
  readonly copiedNotes: readonly string[];
  readonly skippedNotes: readonly string[];
  readonly archivedTickets: readonly string[];
  readonly legacyWorktrees: readonly string[];
}

export function migrateHome(from: string, paths: Paths): MigrationReport {
  const copiedNotes: string[] = [];
  const skippedNotes: string[] = [];
  const source = join(from, "memory");
  for (const file of existsSync(source) ? files(source) : []) {
    const target = join(paths.memory, relative(source, file));
    const name = relative(source, file);
    if (existsSync(target)) {
      skippedNotes.push(name);
      continue;
    }
    mkdirSync(dirname(target), { recursive: true });
    copyFileSync(file, target);
    copiedNotes.push(name);
  }

  const archivedTickets: string[] = [];
  const tickets = join(from, "tickets");
  if (existsSync(tickets)) {
    const archive = join(paths.tickets, "autopilot");
    mkdirSync(archive, { recursive: true });
    for (const name of readdirSync(tickets).filter((entry) => entry.endsWith(".yaml"))) {
      if (!existsSync(join(archive, name))) copyFileSync(join(tickets, name), join(archive, name));
      archivedTickets.push(name);
    }
  }

  const worktrees = join(from, "worktrees");
  const legacyWorktrees = existsSync(worktrees)
    ? readdirSync(worktrees).flatMap((ticket) => {
        const directory = join(worktrees, ticket);
        return statSync(directory).isDirectory() ? readdirSync(directory).map((repo) => join(directory, repo)) : [];
      })
    : [];

  return { copiedNotes, skippedNotes, archivedTickets, legacyWorktrees };
}

function files(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    if (entry === ".git") return [];
    const absolute = join(directory, entry);
    return statSync(absolute).isDirectory() ? files(absolute) : [absolute];
  });
}
