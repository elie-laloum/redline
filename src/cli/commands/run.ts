import * as clack from "@clack/prompts";
import { killRunningCommands } from "../../adapters/exec.ts";
import { type AppContext, createContext } from "../../app/context.ts";
import type { DriveRequest } from "../../app/driver.ts";
import { newLedger, readLedger, writeLedger } from "../../app/ledger.ts";
import { type ImageBuild, type Preflight, preflightOf, runPreflight } from "../../app/preflight.ts";
import { loadHistory } from "../../app/run-history.ts";
import { describeError, fail } from "../../domain/failure.ts";
import { normalizeKey } from "../../domain/ticket.ts";
import { clackPrompter } from "../ask.ts";
import { clackProgress } from "../progress.ts";
import { report } from "../report.ts";
import { runSession } from "../session.ts";
import { type DashboardSession, openDashboard } from "../tui/dashboard.ts";
import { buildImage, offerImageBuild } from "./image.ts";

const BUILD = "Construire";

export async function startCommand(input: string, options: { notes?: string; figma?: string[]; plain?: boolean }): Promise<number> {
  const key = normalizeKey(input);
  const app = createContext();
  if (options.figma?.length && !app.configuration.settings.services.figma) fail("Figma est desactive : --figma n'aurait aucun effet.", "Active-le avec : bun redline init");
  return launch(app, key, {}, options, `redline ${key}`, async (preflight, build) => {
    await runPreflight(app, preflight, { layoutHome: true, build });
    // A ticket that already has a run resumes it; a new one is read from the tracker.
    await preflight.step("ticket", async () => {
      if (readLedger(app.paths, key)) return "un run existe deja : il reprend la ou il en etait";
      const ticket = await app.services.tracker.getTicket(key);
      writeLedger(app.paths, newLedger({ key, squad: ticket.squad, title: ticket.title, url: ticket.url, notes: options.notes ?? null, figmaOverrides: options.figma ?? [], budgets: app.configuration.settings.budgets }));
      return `${ticket.key} — ${ticket.title}`;
    });
  });
}

export async function resumeCommand(input: string, options: { fresh?: boolean; note?: string; plain?: boolean }): Promise<number> {
  const key = normalizeKey(input);
  const app = createContext();
  const request: DriveRequest = { resume: true, ...(options.fresh ? { fresh: { note: options.note ?? null } } : {}) };
  return launch(app, key, request, options, `redline ${key} — reprise`, (preflight, build) => runPreflight(app, preflight, { layoutHome: false, build }));
}

type Prepare = (preflight: Preflight, build: ImageBuild) => Promise<void>;

/**
 * In a terminal the dashboard opens first and pre-flight runs inside it, a missing image asked
 * about and built there; with --plain, a pipe or CI, pre-flight prints as it always did. A
 * failure freezes the screen on its cause, then is reported once the terminal is back.
 */
async function launch(app: AppContext, key: string, request: DriveRequest, options: { plain?: boolean }, intro: string, prepare: Prepare): Promise<number> {
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
      dashboard = await openDashboard({ key, title: readLedger(app.paths, key)?.title ?? "" }, { interrupt });
      const board = dashboard;
      try {
        await prepare(
          preflightOf((step, status, detail) => board.progress.event({ type: "preflight", step, status, detail }), controller.signal),
          async (image, output) => {
            const answer = await board.prompter.ask({
              id: "image",
              executionId: "preflight",
              key: "image",
              requestedAt: new Date().toISOString(),
              question: `Image des agents — ${image} absente\nLes agents tournent dans cette image, construite depuis docker/agent.Dockerfile. La construire maintenant ? Sa sortie s'affiche dans le journal.`,
              choices: [BUILD, "Ne pas construire"],
              allowFreeText: false,
            });
            return answer === BUILD && (await buildImage(image, output)) === 0;
          },
        );
      } catch (error) {
        const stopped = controller.signal.aborted;
        await board.abort(stopped ? "warning" : "error", stopped ? "Interrompu avant le debut du run." : `Le run ne peut pas demarrer.\n${describeError(error)}`);
        board.close();
        if (stopped) return 130;
        throw error;
      }
      const ledger = readLedger(app.paths, key);
      if (ledger) {
        board.retitle(ledger.title);
        board.replay((await loadHistory(app.paths, ledger)).lines);
      }
    } else {
      clack.intro(intro);
      await prepare(
        preflightOf((step, status, detail) => {
          if (step === "ticket" && status === "ok") clack.log.info(detail);
        }, controller.signal),
        offerImageBuild,
      );
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
