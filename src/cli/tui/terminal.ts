import { type CliRenderer, createCliRenderer } from "@opentui/core";
import { THEME } from "./theme.ts";

export interface Terminal {
  readonly renderer: CliRenderer;
  /** Gives the terminal back; safe to call more than once. */
  close(): void;
}

/** The full-screen renderer, with the settings docs/tui.md holds as not negotiable. */
export async function openTerminal(): Promise<Terminal> {
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

  // OpenTUI's own handlers would swallow the error into an overlay and leave the terminal raw.
  const crash = (error: unknown) => {
    close();
    console.error(error);
    process.exit(1);
  };
  process.on("uncaughtException", crash);
  process.on("unhandledRejection", crash);

  function close() {
    process.off("uncaughtException", crash);
    process.off("unhandledRejection", crash);
    if (!renderer.isDestroyed) renderer.destroy();
  }

  return { renderer, close };
}
