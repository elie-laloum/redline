import * as clack from "@clack/prompts";
import { clearTicket } from "../../app/clear.ts";
import { createContext } from "../../app/context.ts";
import { normalizeKey } from "../../domain/ticket.ts";

export async function clearCommand(input: string, options: { force?: boolean; dryRun?: boolean }): Promise<number> {
  const key = normalizeKey(input);
  clack.intro(`${options.dryRun ? "Simulation du nettoyage" : "Nettoyage"} de ${key}`);
  const report = await clearTicket(createContext(), key, { force: Boolean(options.force), dryRun: Boolean(options.dryRun) });
  if (report.removed.length) clack.log.success(`${options.dryRun ? "Serait supprime" : "Supprime"} :\n${report.removed.join("\n")}`);
  if (report.blocked.length) clack.log.warn(`Garde :\n${report.blocked.join("\n")}`);
  if (report.remote.length) clack.log.info(`Traces distantes, laissees en place :\n${report.remote.join("\n")}`);
  clack.outro(report.blocked.length ? "Nettoyage partiel." : "Termine.");
  return report.blocked.length ? 1 : 0;
}
