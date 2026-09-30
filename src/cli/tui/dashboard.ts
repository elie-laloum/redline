import { createCliRenderer, type KeyEvent } from "@opentui/core";
import type { DriveOutcome } from "../../app/driver.ts";
import { clackPrompter, type Prompter } from "../ask.ts";
import { createDashboard, type Dashboard, reduce, tick, type Tone } from "../dashboard/model.ts";
import type { Progress } from "../progress.ts";
import { nextStep } from "../report.ts";
import { THEME } from "./theme.ts";
import { createDashboardView, type Focus, type Screen } from "./view.ts";

export interface DashboardSession {
  readonly progress: Progress;
  readonly prompter: Prompter;
  /** The run stops cleanly after a first Ctrl-C: the banner says so. */
  stopping(): void;
  /** Freezes the screen on the outcome and waits for the human to leave it. */
  finish(outcome: DriveOutcome): Promise<void>;
  /** Gives the terminal back; safe to call more than once. */
  close(): void;
}

export interface DashboardHooks {
  /** Same as a Ctrl-C outside the dashboard: first call stops cleanly, second kills. */
  interrupt(): void;
}

const FOCUS: readonly Focus[] = ["tasks", "inspector", "journal"];
const FRAME_MS = 50;

export async function openDashboard(ticket: { readonly key: string; readonly title: string }, hooks: DashboardHooks): Promise<DashboardSession> {
  const renderer = await createCliRenderer({
    exitOnCtrlC: false,
    exitSignals: [],
    consoleMode: "disabled",
    openConsoleOnError: false,
    screenMode: "alternate-screen",
    useMouse: true,
    autoFocus: false,
    targetFps: 30,
    backgroundColor: THEME.background,
  });

  let state: Dashboard = createDashboard(ticket, Date.now());
  let screen: Screen = { selected: null, follow: true, focus: "tasks", notice: null, ended: false };
  let confirming = false;
  let suspended = false;
  let scheduled: ReturnType<typeof setTimeout> | null = null;
  let leave: (() => void) | null = null;

  const view = createDashboardView(renderer, (index) => select(state.tasks[index]?.key ?? screen.selected, false));

  const draw = () => {
    scheduled = null;
    if (suspended || renderer.isDestroyed) return;
    view.update(state, screen);
    renderer.requestRender();
  };
  const schedule = () => {
    scheduled ??= setTimeout(draw, FRAME_MS);
  };
  const notify = (tone: Tone, text: string | null) => {
    screen = { ...screen, notice: text === null ? null : { tone, text } };
    schedule();
  };
  const select = (key: string | null, follow: boolean) => {
    screen = { ...screen, selected: key, follow };
    schedule();
  };
  const follow = () => {
    if (!screen.follow) return;
    const target = state.active ?? state.tasks.find((row) => row.status === "active")?.key ?? screen.selected ?? state.tasks[0]?.key ?? null;
    if (target !== screen.selected) screen = { ...screen, selected: target };
  };
  const move = (step: number) => {
    const index = state.tasks.findIndex((row) => row.key === screen.selected);
    const next = state.tasks[Math.max(0, Math.min(state.tasks.length - 1, (index < 0 ? 0 : index) + step))];
    if (next) select(next.key, false);
  };

  renderer.keyInput.on("keypress", (key: KeyEvent) => {
    if (screen.ended) {
      if (key.name === "q" || key.name === "return" || key.name === "escape" || (key.ctrl && key.name === "c")) leave?.();
      return;
    }
    if (key.ctrl && key.name === "c") return hooks.interrupt();
    if (confirming) {
      confirming = false;
      if (key.name === "o" || key.name === "y") return hooks.interrupt();
      return notify("info", null);
    }
    switch (key.name) {
      case "q":
        confirming = true;
        return notify("warning", "Arreter le run ? o pour confirmer, une autre touche pour continuer.");
      case "up":
      case "k":
        return move(-1);
      case "down":
      case "j":
        return move(1);
      case "pageup":
      case "pagedown": {
        const pages = key.name === "pageup" ? -1 : 1;
        if (screen.focus === "tasks") return move(pages * view.taskRows);
        return view.scroll(screen.focus, pages);
      }
      case "tab": {
        const index = FOCUS.indexOf(screen.focus);
        screen = { ...screen, focus: FOCUS[(index + (key.shift ? FOCUS.length - 1 : 1)) % FOCUS.length] ?? "tasks" };
        return schedule();
      }
      case "f":
        screen = { ...screen, follow: true };
        follow();
        return schedule();
    }
  });
  renderer.on("resize", schedule);

  const clock = setInterval(() => {
    state = tick(state, Date.now());
    schedule();
  }, 1000);

  const crash = (error: unknown) => {
    close();
    console.error(error);
    process.exit(1);
  };
  process.on("uncaughtException", crash);
  process.on("unhandledRejection", crash);

  function close() {
    clearInterval(clock);
    if (scheduled) clearTimeout(scheduled);
    process.off("uncaughtException", crash);
    process.off("unhandledRejection", crash);
    if (!renderer.isDestroyed) renderer.destroy();
  }

  schedule();

  return {
    progress: {
      event(event) {
        state = reduce(state, event, Date.now());
        follow();
        schedule();
      },
      pause: () => {},
    },
    prompter: {
      // Until the question panels exist, a question steps out of the dashboard into clack.
      async ask(request) {
        suspended = true;
        renderer.suspend();
        try {
          return await clackPrompter.ask(request);
        } finally {
          renderer.resume();
          suspended = false;
          schedule();
        }
      },
    },
    stopping() {
      notify("warning", "Arret en cours : le run s'arrete proprement. Ctrl-C encore pour forcer.");
    },
    async finish(outcome) {
      confirming = false;
      screen = { ...screen, ended: true };
      const { tone, text } = summary(ticket.key, outcome);
      notify(tone, `${text}\nq pour quitter.`);
      await new Promise<void>((resolve) => {
        leave = resolve;
      });
    },
    close,
  };
}

function summary(key: string, outcome: DriveOutcome): { readonly tone: Tone; readonly text: string } {
  switch (outcome.status) {
    case "done": {
      const requests = outcome.publication.mergeRequests.length;
      return { tone: "success", text: `${key} publie : ${requests} MR, canal #${outcome.publication.slack.channel.name}.` };
    }
    case "escalated": {
      const { escalation } = outcome;
      return { tone: "error", text: `Escalade ${escalation.kind} sur ${escalation.task} : ${escalation.detail}\n${nextStep(key, escalation.kind)}` };
    }
    case "paused":
      return { tone: "warning", text: outcome.detail };
    case "cancelled":
      return { tone: "warning", text: `Interrompu. Reprends avec : bun redline resume ${key}` };
    case "waiting":
      return { tone: "warning", text: `Des questions attendent. Reprends avec : bun redline resume ${key}` };
  }
}
