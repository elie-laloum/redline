import { createCliRenderer, type KeyEvent } from "@opentui/core";
import type { DriveOutcome } from "../../app/driver.ts";
import type { Prompter } from "../ask.ts";
import { createDashboard, type Dashboard, reduce, tick, type Tone } from "../dashboard/model.ts";
import type { Progress } from "../progress.ts";
import { nextStep } from "../report.ts";
import { type Asked, askedOf, createQuestionPanel } from "./question.ts";
import { THEME } from "./theme.ts";
import { createDashboardView, type Focus, type Layout, type Screen } from "./view.ts";

export interface DashboardSession {
  readonly progress: Progress;
  readonly prompter: Prompter;
  /** The run stops cleanly after a first Ctrl-C: the banner says so, and a pending question is dropped. */
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

const PANELS: readonly Focus[] = ["tasks", "inspector", "journal"];
const FRAME_MS = 50;
const BELL = "\u0007";

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
  let screen: Screen = { selected: null, follow: true, focus: "tasks", layout: "dashboard", notice: null, ended: false };
  let confirming = false;
  let scheduled: ReturnType<typeof setTimeout> | null = null;
  let leave: (() => void) | null = null;
  let pending: { readonly asked: Asked; readonly resolve: (value: string | null) => void } | null = null;
  /** The plan review's note, answered with the decision: the follow-up question gets it at once. */
  let note: { readonly key: string; readonly value: string } | null = null;

  const view = createDashboardView(renderer, (task) => select(task, false));
  const panel = createQuestionPanel(renderer, view.slots.question, view.slots.review);

  const layoutOf = (focus: Focus): Layout => (pending && focus === "question" ? (pending.asked.review ? "review" : "question") : "dashboard");
  const draw = () => {
    scheduled = null;
    if (renderer.isDestroyed) return;
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
  const focusOn = (focus: Focus) => {
    screen = { ...screen, focus, layout: layoutOf(focus) };
    if (focus === "question") panel.focus();
    else panel.blur();
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
  const cycle = (backwards: boolean) => {
    const order: readonly Focus[] = pending ? ["question", ...PANELS] : PANELS;
    const index = Math.max(0, order.indexOf(screen.focus));
    focusOn(order[(index + (backwards ? order.length - 1 : 1)) % order.length] ?? "tasks");
  };
  const settle = (value: string | null) => {
    if (!pending) return;
    const { resolve } = pending;
    pending = null;
    panel.hide();
    focusOn("tasks");
    resolve(value);
  };

  renderer.keyInput.on("keypress", (key: KeyEvent) => {
    // The end screen still browses: every step's result stays readable until the human leaves.
    if (screen.ended && (key.name === "q" || key.name === "return" || key.name === "escape" || (key.ctrl && key.name === "c"))) return leave?.();
    if (key.ctrl && key.name === "c") return hooks.interrupt();
    if (key.name === "tab") {
      key.preventDefault();
      return cycle(key.shift);
    }
    if (screen.focus === "question") {
      // Everything else belongs to the choices or the text area.
      if (key.name === "pageup" || key.name === "pagedown") {
        key.preventDefault();
        return panel.scroll(key.name === "pageup" ? -1 : 1);
      }
      if (key.name === "escape" && panel.back()) key.preventDefault();
      return;
    }
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
      ask(request) {
        const asked = askedOf(request);
        const noted = note;
        note = null;
        if (noted && noted.key === asked.key && asked.choices.length === 0) return Promise.resolve(noted.value);
        process.stdout.write(BELL);
        return new Promise((resolve) => {
          pending = { asked, resolve };
          panel.show(asked, (answer) => {
            if (answer.note !== null) note = { key: asked.key, value: answer.note };
            settle(answer.value);
          });
          focusOn("question");
        });
      },
    },
    stopping() {
      settle(null);
      notify("warning", "Arret en cours : le run s'arrete proprement. Ctrl-C encore pour forcer.");
    },
    async finish(outcome) {
      settle(null);
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
