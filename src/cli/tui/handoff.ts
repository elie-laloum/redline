import type { CliRenderer } from "@opentui/core";

const BACK = "— Entree pour revenir a redline —";

/**
 * Gives the terminal to `run` while the screen is suspended — alternate screen left, raw mode and
 * mouse off — as a shell would, then takes it back. `pause` keeps the child's output on screen
 * until the human presses Enter.
 */
export async function handOff<T>(renderer: CliRenderer, run: () => Promise<T>, pause: boolean): Promise<T> {
  renderer.suspend();
  try {
    const result = await run();
    if (pause) await waitForEnter();
    return result;
  } finally {
    renderer.resume();
  }
}

/** A child process that owns the terminal, as if launched from the shell. */
export async function runInherited(argv: readonly string[], cwd?: string): Promise<number> {
  const child = Bun.spawn([...argv], { stdio: ["inherit", "inherit", "inherit"], ...(cwd ? { cwd } : {}) });
  return child.exited;
}

/**
 * A child process in a pseudo-terminal of its own, shown and typed into as if it owned the real
 * one, whose output is also kept. A wide terminal keeps the child from wrapping a long line —
 * a token — that has to be read back whole.
 */
export async function runCaptured(argv: readonly string[], cols = 240): Promise<{ readonly code: number; readonly output: string }> {
  const decoder = new TextDecoder();
  let output = "";
  const child = Bun.spawn([...argv], {
    terminal: {
      cols: Math.max(cols, process.stdout.columns ?? 80),
      rows: process.stdout.rows ?? 24,
      data(_terminal, data) {
        process.stdout.write(data);
        output += decoder.decode(data, { stream: true });
      },
    },
  });
  const forward = (chunk: Buffer) => child.terminal?.write(chunk);
  process.stdin.setRawMode?.(true);
  process.stdin.resume();
  process.stdin.on("data", forward);
  try {
    return { code: await child.exited, output };
  } finally {
    process.stdin.off("data", forward);
    process.stdin.setRawMode?.(false);
    process.stdin.pause();
    child.terminal?.close();
  }
}

/** The human's editor on `file`: $VISUAL, then $EDITOR, then vi. */
export function openEditor(file: string): Promise<number> {
  const editor = process.env.VISUAL || process.env.EDITOR || "vi";
  return runInherited(["sh", "-c", `${editor} "$1"`, "sh", file]);
}

export function waitForEnter(): Promise<void> {
  process.stdout.write(`\n${BACK}\n`);
  return new Promise((resolve) => {
    process.stdin.resume();
    process.stdin.once("data", () => {
      process.stdin.pause();
      resolve();
    });
  });
}

/** A claude setup-token token in what the command printed, its colours and cursor moves left out. */
export function oauthTokenIn(output: string): string | null {
  const plain = output.replace(/\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g, "").replace(/\x1b\[[0-9;?]*[ -/]*[@-~]/g, "");
  return /sk-ant-oat01-[A-Za-z0-9_-]{20,}/.exec(plain)?.[0] ?? null;
}
