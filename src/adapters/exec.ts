import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { clip, focusOn } from "../domain/output.ts";

export type StopCause = "exit" | "timeout" | "silence" | "abort";

export interface RunResult {
  readonly command: string;
  readonly cwd: string;
  readonly exitCode: number;
  readonly stoppedBy: StopCause;
  readonly durationMs: number;
  readonly silentForMs: number;
  readonly maxSilentMs: number;
  readonly stdout: string;
  readonly stderr: string;
  readonly truncated: boolean;
  readonly logPath: string | null;
  readonly focusMatched: number | null;
}

export interface RunOptions {
  readonly cwd: string;
  readonly timeoutMs: number;
  readonly silenceMs: number;
  readonly env?: Readonly<Record<string, string>>;
  readonly keepLines?: number;
  readonly focus?: string;
  readonly log?: { readonly directory: string; readonly label: string };
  readonly onProgress?: (elapsedMs: number) => void;
  readonly signal?: AbortSignal;
}

const INHERITED_BUT_HARMFUL = ["NODE_TEST_CONTEXT", "NODE_OPTIONS", "NODE_V8_COVERAGE", "TEST_RUNNER"];
const PROGRESS_EVERY_MS = 15_000;
const running = new Set<() => void>();

export function run(command: string, options: RunOptions): Promise<RunResult> {
  const keepLines = options.keepLines ?? 120;
  const startedAt = Date.now();

  return new Promise<RunResult>((resolve) => {
    const child = spawn(command, { cwd: options.cwd, shell: true, detached: true, env: childEnv(options.env) });
    let stdout = "";
    let stderr = "";
    let lastOutputAt = startedAt;
    let maxSilentMs = 0;
    let stoppedBy: StopCause = "exit";
    let settled = false;

    const killTree = (): void => {
      const pid = child.pid;
      if (pid === undefined) return;
      const signal = (name: NodeJS.Signals) => {
        try {
          process.kill(-pid, name);
        } catch {
          child.kill(name);
        }
      };
      signal("SIGTERM");
      setTimeout(() => signal("SIGKILL"), 2_000).unref?.();
    };
    const stop = (cause: StopCause) => {
      stoppedBy = cause;
      killTree();
    };

    const timer = setTimeout(() => stop("timeout"), options.timeoutMs);
    const tick = Math.max(1000, Math.min(PROGRESS_EVERY_MS, options.silenceMs / 2));
    const watchdog = setInterval(() => {
      if (Date.now() - lastOutputAt >= options.silenceMs) {
        clearInterval(watchdog);
        stop("silence");
        return;
      }
      options.onProgress?.(Date.now() - startedAt);
    }, tick);
    const onAbort = () => stop("abort");
    options.signal?.addEventListener("abort", onAbort, { once: true });
    running.add(killTree);

    const record = (chunk: Buffer, into: "out" | "err") => {
      const now = Date.now();
      maxSilentMs = Math.max(maxSilentMs, now - lastOutputAt);
      lastOutputAt = now;
      if (into === "out") stdout += chunk.toString();
      else stderr += chunk.toString();
    };
    child.stdout?.on("data", (chunk: Buffer) => record(chunk, "out"));
    child.stderr?.on("data", (chunk: Buffer) => record(chunk, "err"));

    const done = (partial: Pick<RunResult, "exitCode" | "stdout" | "stderr" | "truncated" | "logPath" | "focusMatched">) => {
      if (settled) return;
      settled = true;
      running.delete(killTree);
      clearTimeout(timer);
      clearInterval(watchdog);
      options.signal?.removeEventListener("abort", onAbort);
      const silentForMs = Date.now() - lastOutputAt;
      resolve({
        ...partial,
        command,
        cwd: options.cwd,
        stoppedBy,
        durationMs: Date.now() - startedAt,
        silentForMs,
        maxSilentMs: Math.max(maxSilentMs, silentForMs),
      });
    };

    child.on("error", (error) => done({ exitCode: 127, stdout: "", stderr: error.message, truncated: false, logPath: null, focusMatched: null }));

    const finish = (code: number | null) => {
      const focusedOut = focusOn(stdout, options.focus);
      const focusedErr = focusOn(stderr, options.focus);
      const out = clip(focusedOut.text, keepLines);
      const err = clip(focusedErr.text, keepLines);
      const partial = out.truncated || err.truncated || focusedOut.filtered || focusedErr.filtered;
      done({
        exitCode: stoppedBy === "exit" ? (code ?? 1) : 124,
        stdout: out.text,
        stderr: err.text,
        truncated: out.truncated || err.truncated,
        logPath: partial && options.log ? writeLog(options.log, command, stdout, stderr) : null,
        focusMatched: options.focus ? focusedOut.matched + focusedErr.matched : null,
      });
    };
    // A surviving grandchild keeps the pipes open, so `close` may never come.
    child.on("exit", (code) => setTimeout(() => finish(code), 2_000).unref?.());
    child.on("close", (code) => finish(code));
  });
}

export function killRunningCommands(): void {
  for (const kill of [...running]) kill();
  running.clear();
}

export function stopReason(result: Pick<RunResult, "stoppedBy" | "silentForMs" | "durationMs">): string | null {
  switch (result.stoppedBy) {
    case "exit":
      return null;
    case "silence":
      return `Commande abandonnee apres ${Math.round(result.silentForMs / 1000)}s sans la moindre sortie : attente d'infrastructure probable (conteneurs, base, ports), pas un test lent.`;
    case "abort":
      return "Commande interrompue a la demande.";
    default:
      return `Commande abandonnee au plafond de ${Math.round(result.durationMs / 1000)}s alors qu'elle ecrivait encore : commande reellement longue.`;
  }
}

function childEnv(overrides: Readonly<Record<string, string>> | undefined): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env, ...overrides, CI: "1", FORCE_COLOR: "0" };
  for (const key of INHERITED_BUT_HARMFUL) delete env[key];
  return env;
}

function writeLog(log: { directory: string; label: string }, command: string, stdout: string, stderr: string): string | null {
  try {
    mkdirSync(log.directory, { recursive: true });
    const stamp = new Date().toISOString().replaceAll(/[:.]/g, "-");
    const path = join(log.directory, `${log.label.replaceAll(/[^A-Za-z0-9._-]+/g, "-")}-${stamp}.log`);
    writeFileSync(path, `$ ${command}\n\n--- stdout ---\n${stdout}\n--- stderr ---\n${stderr}\n`, "utf8");
    return path;
  } catch {
    return null;
  }
}
