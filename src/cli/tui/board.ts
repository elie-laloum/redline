import type { CliRenderer, KeyEvent } from "@opentui/core";
import { collectChanges } from "../dashboard/changes.ts";
import { describeError } from "../../domain/failure.ts";
import type { Insight, InsightRequest } from "../../domain/insight.ts";
import type { RunEvent } from "../../domain/run-events.ts";
import { INSIGHT_KEYS, type InsightKey, MENU, pressInsight } from "../dashboard/insight.ts";
import { createDashboard, type Dashboard, reduce, tick, type Tone } from "../dashboard/model.ts";
import { createDashboardView, type DashboardView, RIGHT_VIEWS, type Screen } from "./view.ts";

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
  /** Arrows, j / k, PgUp / PgDn, f, v and e — and, while the explanation view's questions have the focus, their keys; false for any other key. */
  navigate(key: KeyEvent): boolean;
  /** True while the questions to the explainer take the keys, Esc and Enter included. */
  readonly asking: boolean;
  /** Stops the clock at the moment a run ended, or starts it again with null. */
  freeze(at: number | null): void;
  /** Takes the board off the screen; the renderer stays open. */
  dispose(): void;
}

/** Puts one question to the run explainer; absent where no agent can be called. */
export type Explainer = (request: InsightRequest) => Promise<Insight>;

export function createBoard(renderer: CliRenderer, ticket: { readonly key: string; readonly title: string }, first: Screen, explainer: Explainer | null = null): Board {
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

  // The changes view reads git, so it refreshes on its own slow beat and only while it is open.
  let reading = false;
  const watcher = setInterval(() => {
    const workspaces = Object.values(state.workspaces);
    if (screen.view !== "changes" || reading || workspaces.length === 0) return;
    reading = true;
    collectChanges(workspaces)
      .then((changes) => set({ changes }))
      .catch(() => {})
      .finally(() => {
        reading = false;
      });
  }, 3000);
  renderer.on("resize", schedule);
  schedule();

  // Answers already paid for are kept for the screen's lifetime; r asks again.
  const answers = new Map<string, Insight>();
  let question = 0;
  const askExplainer = (request: InsightRequest, fresh: boolean) => {
    const cacheKey = `${request.question}:${request.task ?? ""}`;
    const known = fresh ? undefined : answers.get(cacheKey);
    if (known) return set({ insight: { mode: "answer", request, insight: known, cursor: 0, open: [] } });
    if (!explainer) return set({ insight: { mode: "failed", request, text: "Aucun agent n'est joignable depuis cet ecran." } });
    const asked = ++question;
    const current = () => asked === question && screen.insight?.mode === "asking";
    explainer(request)
      .then((insight) => {
        answers.set(cacheKey, insight);
        if (current()) set({ insight: { mode: "answer", request, insight, cursor: 0, open: [] } });
      })
      .catch((error: unknown) => {
        if (current()) set({ insight: { mode: "failed", request, text: describeError(error) } });
      });
  };
  const insightHasKeys = () => screen.view === "explain" && screen.insight !== null && screen.focus === "inspector";

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
    get asking() {
      return insightHasKeys();
    },
    navigate(key) {
      if (key.name === "e" && !key.ctrl) {
        set({ view: "explain", insight: screen.insight ?? MENU, focus: "inspector", changes: null });
        return true;
      }
      if (insightHasKeys() && screen.insight && INSIGHT_KEYS.has(key.name)) {
        const move = pressInsight(screen.insight, key.name as InsightKey, screen.selected);
        set({ insight: move.panel });
        if (move.ask) askExplainer(move.ask.request, move.ask.fresh);
        return true;
      }
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
        case "v": {
          const order = RIGHT_VIEWS;
          const index = Math.max(0, order.indexOf(screen.view));
          set({ view: order[(index + 1) % order.length] ?? "inspector", ...(screen.view === "inspector" ? {} : { changes: null }) });
          return true;
        }
        case "left":
        case "right":
          view.scrollSideways(screen.focus, key.name === "left" ? -1 : 1);
          renderer.requestRender();
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
      clearInterval(watcher);
      if (scheduled) clearTimeout(scheduled);
      scheduled = null;
      renderer.off("resize", schedule);
      if (!renderer.isDestroyed) view.destroy();
    },
  };
}
