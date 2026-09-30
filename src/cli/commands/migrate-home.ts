import { homedir } from "node:os";
import { join, resolve } from "node:path";
import * as clack from "@clack/prompts";
import { ensureHome } from "../../app/home.ts";
import { migrateHome } from "../../app/migrate.ts";
import { expandTilde, homeDirectory, pathsOf } from "../../app/paths.ts";

export async function migrateHomeCommand(options: { from?: string }): Promise<number> {
  const from = resolve(expandTilde(options.from ?? join(homedir(), ".autopilot")));
  const paths = pathsOf(homeDirectory());
  clack.intro(`Migration ${from} → ${paths.home}`);
  await ensureHome(paths);
  const report = migrateHome(from, paths);
  clack.log.success(`${report.copiedNotes.length} note(s) copiee(s), ${report.skippedNotes.length} deja presente(s).`);
  clack.log.info(`${report.archivedTickets.length} ticket(s) archive(s) sous tickets/autopilot/ (non repris).`);
  if (report.legacyWorktrees.length > 0) {
    clack.log.warn(`Anciens worktrees a supprimer a la main :\n${report.legacyWorktrees.join("\n")}`);
  }
  clack.outro("Migration terminee.");
  return 0;
}
