import * as clack from "@clack/prompts";
import { killRunningCommands } from "../../adapters/exec.ts";
import { type AppContext, createContext } from "../../app/context.ts";
import type { DriveRequest } from "../../app/driver.ts";
import { ensureHome } from "../../app/home.ts";
import { ensureMemory } from "../../app/memory-repository.ts";
import { newLedger, readLedger, writeLedger } from "../../app/ledger.ts";
import { authenticationPreflight, registryPreflight, sandboxPreflight, servicesPreflight } from "../../app/preflight.ts";
import { loadHistory } from "../../app/run-history.ts";
import type { AuthMode } from "../../domain/config.ts";
import { fail } from "../../domain/failure.ts";
import { normalizeKey } from "../../domain/ticket.ts";
import { clackPrompter } from "../ask.ts";
import { offerImageBuild } from "./image.ts";
import { clackProgress } from "../progress.ts";
import { report } from "../report.ts";
import { runSession } from "../session.ts";
import { type DashboardSession, openDashboard } from "../tui/dashboard.ts";

export async function startCommand(input: string, options: { notes?: string; figma?: string[]; auth?: AuthMode; plain?: boolean }): Promise<number> {
  const key = normalizeKey(input);
  const app = createContext(options.auth ? { authentication: options.auth } : {});
  if (options.figma?.length && !app.configuration.settings.services.figma) fail("Figma est desactive : --figma n'aurait aucun effet.", "Active-le avec : bun redline init");
  // Cloned before the home lays out its folders, which would otherwise take the clone's place.
  await ensureMemory(app.memoryRepository);
  await ensureHome(app.paths);
  clack.intro(`redline ${key}`);
  await preflight(app);
  if (readLedger(app.paths, key)) {
    clack.log.info("Un run existe deja pour ce ticket : il reprend la ou il en etait.");
  } else {
    const ticket = await app.services.tracker.getTicket(key);
    writeLedger(app.paths, newLedger({ key, squad: ticket.squad, title: ticket.title, url: ticket.url, notes: options.notes ?? null, figmaOverrides: options.figma ?? [], budgets: app.configuration.settings.budgets }));
    clack.log.info(`${ticket.key} — ${ticket.title}`);
  }
  return interactive(app, key, {}, options);
}

export async function resumeCommand(input: string, options: { fresh?: boolean; note?: string; auth?: AuthMode; plain?: boolean }): Promise<number> {
  const key = normalizeKey(input);
  const app = createContext(options.auth ? { authentication: options.auth } : {});
  clack.intro(`redline ${key} — reprise`);
  await ensureMemory(app.memoryRepository);
  await preflight(app);
  return interactive(app, key, { resume: true, ...(options.fresh ? { fresh: { note: options.note ?? null } } : {}) }, options);
}

async function preflight(app: AppContext): Promise<void> {
  registryPreflight(app);
  servicesPreflight(app);
  authenticationPreflight(app);
  await sandboxPreflight(app, { build: offerImageBuild });
}

async function interactive(app: AppContext, key: string, request: DriveRequest, options: { plain?: boolean }): Promise<number> {
  const controller = new AbortController();
  let dashboard: DashboardSession | null = null;
  const interrupt = () => {
    if (controller.signal.aborted) {
      killRunningCommands();
      dashboard?.close();
      process.exit(130);
    }
    if (dashboard) dashboard.stopping();
    else clack.log.warn("Interruption demandee : le run s'arrete proprement (Ctrl-C encore pour forcer).");
    controller.abort();
  };
  process.on("SIGINT", interrupt);
  try {
    if (!options.plain && process.stdout.isTTY && process.stdin.isTTY) {
      const ledger = readLedger(app.paths, key);
      dashboard = await openDashboard({ key, title: ledger?.title ?? "" }, { interrupt });
      if (ledger) dashboard.replay((await loadHistory(app.paths, ledger)).lines);
    }
    const session = dashboard ?? { prompter: clackPrompter, progress: clackProgress() };
    const outcome = await runSession(app, key, request, { prompter: session.prompter, progress: session.progress, signal: controller.signal });
    if (dashboard) await dashboard.finish(outcome);
    dashboard?.close();
    return report(key, outcome);
  } finally {
    dashboard?.close();
    process.off("SIGINT", interrupt);
  }
}
