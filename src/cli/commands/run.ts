import * as clack from "@clack/prompts";
import { killRunningCommands } from "../../adapters/exec.ts";
import { type AppContext, createContext } from "../../app/context.ts";
import type { DriveRequest } from "../../app/driver.ts";
import { ensureHome } from "../../app/home.ts";
import { newLedger, readLedger, writeLedger } from "../../app/ledger.ts";
import { normalizeKey } from "../../domain/ticket.ts";
import { clackPrompter } from "../ask.ts";
import { clackProgress } from "../progress.ts";
import { report } from "../report.ts";
import { runSession } from "../session.ts";

export async function startCommand(input: string, options: { notes?: string; figma?: string[] }): Promise<number> {
  const key = normalizeKey(input);
  const app = createContext();
  await ensureHome(app.paths);
  clack.intro(`redline ${key}`);
  if (readLedger(app.paths, key)) {
    clack.log.info("Un run existe deja pour ce ticket : il reprend la ou il en etait.");
  } else {
    const ticket = await app.services.tracker.getTicket(key);
    writeLedger(app.paths, newLedger({ key, squad: ticket.squad, title: ticket.title, url: ticket.url, notes: options.notes ?? null, figmaOverrides: options.figma ?? [], budgets: app.configuration.settings.budgets }));
    clack.log.info(`${ticket.key} — ${ticket.title}`);
  }
  return interactive(app, key, {});
}

export async function resumeCommand(input: string, options: { fresh?: boolean; note?: string }): Promise<number> {
  const key = normalizeKey(input);
  const app = createContext();
  clack.intro(`redline ${key} — reprise`);
  return interactive(app, key, { resume: true, ...(options.fresh ? { fresh: { note: options.note ?? null } } : {}) });
}

async function interactive(app: AppContext, key: string, request: DriveRequest): Promise<number> {
  const controller = new AbortController();
  const interrupt = () => {
    if (controller.signal.aborted) {
      killRunningCommands();
      process.exit(130);
    }
    clack.log.warn("Interruption demandee : le run s'arrete proprement (Ctrl-C encore pour forcer).");
    controller.abort();
  };
  process.on("SIGINT", interrupt);
  try {
    const outcome = await runSession(app, key, request, { prompter: clackPrompter, progress: clackProgress(), signal: controller.signal });
    return report(key, outcome);
  } finally {
    process.off("SIGINT", interrupt);
  }
}
