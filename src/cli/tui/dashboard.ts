import type { KeyEvent } from "@opentui/core";
import type { DriveOutcome } from "../../app/driver.ts";
import type { JournalLine } from "../../app/event-journal.ts";
import type { Prompter } from "../ask.ts";
import { begin, type Tone } from "../dashboard/model.ts";
import type { Progress } from "../progress.ts";
import { outcomeNotice } from "../report.ts";
import { createBoard } from "./board.ts";
import { type Asked, askedOf, createQuestionPanel } from "./question.ts";
import { openTerminal } from "./terminal.ts";
import type { Focus, Layout } from "./view.ts";

export interface DashboardSession {
  readonly progress: Progress;
  readonly prompter: Prompter;
  /** Shows what the run's earlier sessions did, before this one starts. */
  replay(lines: readonly JournalLine[]): void;
  /** The ticket's title, once pre-flight has read it. */
  retitle(title: string): void;
  /** Freezes the screen on why the run could not start, and waits for the human to leave it. */
  abort(tone: Tone, text: string): Promise<void>;
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
const BELL = "\u0007";

export async function openDashboard(ticket: { readonly key: string; readonly title: string }, hooks: DashboardHooks): Promise<DashboardSession> {
  const terminal = await openTerminal();
  const { renderer } = terminal;
  const board = createBoard(renderer, ticket, { selected: null, follow: true, focus: "tasks", layout: "dashboard", notice: null, ended: false, watching: null });
  const panel = createQuestionPanel(renderer, board.view.slots.question, board.view.slots.review);

  let confirming = false;
  let leave: (() => void) | null = null;
  let pending: { readonly asked: Asked; readonly resolve: (value: string | null) => void } | null = null;
  /** The plan review's note, answered with the decision: the follow-up question gets it at once. */
  let note: { readonly key: string; readonly value: string } | null = null;

  const layoutOf = (focus: Focus): Layout => (pending && focus === "question" ? (pending.asked.review ? "review" : "question") : "dashboard");
  const focusOn = (focus: Focus) => {
    board.set({ focus, layout: layoutOf(focus) });
    if (focus === "question") panel.focus();
    else panel.blur();
  };
  const cycle = (backwards: boolean) => {
    const order: readonly Focus[] = pending ? ["question", ...PANELS] : PANELS;
    const index = Math.max(0, order.indexOf(board.screen.focus));
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

  const onKey = (key: KeyEvent) => {
    // The end screen still browses: every step's result stays readable until the human leaves.
    if (board.screen.ended && (key.name === "q" || key.name === "return" || key.name === "escape" || (key.ctrl && key.name === "c"))) return leave?.();
    if (key.ctrl && key.name === "c") return hooks.interrupt();
    if (key.name === "tab") {
      key.preventDefault();
      return cycle(key.shift);
    }
    if (board.screen.focus === "question") {
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
      return board.notify("info", null);
    }
    if (key.name === "q") {
      confirming = true;
      return board.notify("warning", "Arreter le run ? o pour confirmer, une autre touche pour continuer.");
    }
    board.navigate(key);
  };
  renderer.keyInput.on("keypress", onKey);

  function close() {
    renderer.keyInput.off("keypress", onKey);
    board.dispose();
    terminal.close();
  }

  return {
    progress: {
      event: (event) => board.feed(event, Date.now()),
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
    retitle(title) {
      board.apply((state) => ({ ...state, title }));
    },
    async abort(tone, text) {
      settle(null);
      confirming = false;
      board.set({ ended: true });
      board.freeze(Date.now());
      board.notify(tone, `${text}\nq pour quitter.`);
      await new Promise<void>((resolve) => {
        leave = resolve;
      });
    },
    replay(lines) {
      for (const line of lines) if ("event" in line) board.feed(line.event, line.at);
      board.apply((state) => begin(state, Date.now()));
    },
    stopping() {
      settle(null);
      board.notify("warning", "Arret en cours : le run s'arrete proprement. Ctrl-C encore pour forcer.");
    },
    async finish(outcome) {
      settle(null);
      confirming = false;
      board.set({ ended: true });
      board.freeze(Date.now());
      const { tone, text } = outcomeNotice(ticket.key, outcome);
      board.notify(tone, `${text}\nq pour quitter.`);
      await new Promise<void>((resolve) => {
        leave = resolve;
      });
    },
    close,
  };
}
