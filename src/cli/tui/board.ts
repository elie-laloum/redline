import type { CliRenderer, KeyEvent } from "@opentui/core";
import type { RunEvent } from "../../domain/run-events.ts";
import { createDashboard, type Dashboard, reduce, tick, type Tone } from "../dashboard/model.ts";
import { createDashboardView, type DashboardView, type Screen } from "./view.ts";

const FRAME_MS = 50;

/** The dashboard's state, its screen and the keys that browse it: what a run and show share. */
export interface Board {
  readonly view: DashboardView;
  readonly state: Dashboard;
  readonly screen: Screen;
  apply(change: (state: Dashboard) => Dashboard): void;
  feed(event: RunEvent, at: number): void;
  set(change: Partial<Screen>): void;
  notify(tone: Tone, text: string | null): void;
  /** Arrows, j / k, PgUp / PgDn and f; false for any other key. */
  navigate(key: KeyEvent): boolean;
  /** Stops the clock at the moment a run ended, or starts it again with null. */
  freeze(at: number | null): void;
  /** Takes the board off the screen; the renderer stays open. */
  dispose(): void;
}

export function createBoard(renderer: CliRenderer, ticket: { readonly key: string; readonly title: string }, first: Screen): Board {
  let state: Dashboard = createDashboard(ticket, Date.now());
  let screen: Screen = first;
  let scheduled: ReturnType<typeof setTimeout> | null = null;
  let frozen = false;

  const view = createDashboardView(renderer, (task) => select(task, false));

  const draw = () => {
    scheduled = null;
    if (renderer.isDestroyed) return;
    view.update(state, screen);
    renderer.requestRender();
  };
  const schedule = () => {
    scheduled ??= setTimeout(draw, FRAME_MS);
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
  const apply = (change: (state: Dashboard) => Dashboard) => {
    state = change(state);
    follow();
    schedule();
  };
  const set = (change: Partial<Screen>) => {
    screen = { ...screen, ...change };
    schedule();
  };

  const clock = setInterval(() => {
    if (frozen) return;
    state = tick(state, Date.now());
    schedule();
  }, 1000);
  renderer.on("resize", schedule);
  schedule();

  return {
    view,
    get state() {
      return state;
    },
    get screen() {
      return screen;
    },
    apply,
    feed: (event, at) => apply((current) => reduce(current, event, at)),
    set,
    notify: (tone, text) => set({ notice: text === null ? null : { tone, text } }),
    navigate(key) {
      switch (key.name) {
        case "up":
        case "k":
          move(-1);
          return true;
        case "down":
        case "j":
          move(1);
          return true;
        case "pageup":
        case "pagedown": {
          const pages = key.name === "pageup" ? -1 : 1;
          if (screen.focus === "tasks") move(pages * view.taskRows);
          else view.scroll(screen.focus, pages);
          return true;
        }
        case "f":
          screen = { ...screen, follow: true };
          follow();
          schedule();
          return true;
        default:
          return false;
      }
    },
    freeze(at) {
      frozen = at !== null;
      if (at !== null) state = tick(state, at);
      schedule();
    },
    dispose() {
      clearInterval(clock);
      if (scheduled) clearTimeout(scheduled);
      scheduled = null;
      renderer.off("resize", schedule);
      if (!renderer.isDestroyed) view.destroy();
    },
  };
}
