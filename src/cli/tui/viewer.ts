import type { CliRenderer, KeyEvent } from "@opentui/core";
import { type Board, createBoard } from "./board.ts";
import type { Focus } from "./view.ts";

export interface Viewer {
  readonly board: Board;
  /** Resolves when the human leaves: q, Esc or Ctrl-C. */
  readonly left: Promise<void>;
  /** Takes the viewer off the screen; the renderer stays open. */
  close(): void;
}

const PANELS: readonly Focus[] = ["tasks", "inspector", "journal"];

/** The dashboard, read-only: nothing here reaches the run, and leaving never stops it. */
export function openViewer(renderer: CliRenderer, ticket: { readonly key: string; readonly title: string }, back: boolean): Viewer {
  const board = createBoard(renderer, ticket, { selected: null, follow: true, focus: "tasks", layout: "dashboard", notice: null, ended: false, watching: { pid: null, back } });
  let leave: () => void = () => {};
  const left = new Promise<void>((resolve) => {
    leave = resolve;
  });

  const onKey = (key: KeyEvent) => {
    if (key.name === "q" || key.name === "escape" || (key.ctrl && key.name === "c")) return leave();
    if (key.name === "tab") {
      key.preventDefault();
      const index = Math.max(0, PANELS.indexOf(board.screen.focus));
      return board.set({ focus: PANELS[(index + (key.shift ? PANELS.length - 1 : 1)) % PANELS.length] ?? "tasks" });
    }
    board.navigate(key);
  };
  renderer.keyInput.on("keypress", onKey);

  return {
    board,
    left,
    close() {
      renderer.keyInput.off("keypress", onKey);
      board.dispose();
    },
  };
}
