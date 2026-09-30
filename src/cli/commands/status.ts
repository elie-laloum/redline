import { readdirSync } from "node:fs";
import * as clack from "@clack/prompts";
import { createContext } from "../../app/context.ts";
import { readLedger } from "../../app/ledger.ts";
import { renderPlan, type Plan } from "../../domain/plan.ts";
import { normalizeKey } from "../../domain/ticket.ts";

export function statusCommand(input: string | undefined, options: { plan?: boolean }): number {
  const app = createContext();
  if (!input) {
    const keys = readdirSync(app.paths.tickets).filter((name) => name.endsWith(".yaml")).map((name) => name.replace(/\.yaml$/, ""));
    if (keys.length === 0) clack.log.info("Aucun run.");
    for (const key of keys) {
      const ledger = readLedger(app.paths, key);
      if (ledger) clack.log.message(`${key} — ${ledger.phase}${ledger.escalation ? ` (${ledger.escalation.kind} sur ${ledger.escalation.task})` : ""} — ${ledger.title}`);
    }
    return 0;
  }
  const key = normalizeKey(input);
  const ledger = readLedger(app.paths, key);
  if (!ledger) {
    clack.log.error(`Aucun run pour ${key}.`);
    return 1;
  }
  clack.intro(`${key} — ${ledger.title}`);
  clack.log.info(`Phase : ${ledger.phase}${ledger.active ? ` (en cours, pid ${ledger.active.pid})` : ""}`);
  if (ledger.escalation) clack.log.error(`Escalade ${ledger.escalation.kind} sur ${ledger.escalation.task} :\n${ledger.escalation.detail}`);
  clack.log.message(ledger.history.map((entry) => `${entry.at.slice(0, 16).replace("T", " ")}  ${entry.event}`).join("\n"));
  const approved = ledger.approved as { plan?: Plan } | null;
  if (options.plan && approved?.plan) clack.log.message(renderPlan(approved.plan));
  clack.outro(ledger.url);
  return 0;
}
