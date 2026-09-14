import { spawn } from "node:child_process";
import { loadConfig } from "./config.ts";

export interface RunResult {
  readonly command: string;
  readonly cwd: string;
  readonly exitCode: number;
  readonly timedOut: boolean;
  readonly durationMs: number;
  readonly stdout: string;
  readonly stderr: string;
  readonly truncated: boolean;
}

export interface RunOptions {
  readonly cwd: string;
  readonly timeoutMs?: number;
  readonly env?: Readonly<Record<string, string>>;
  /** Nombre de lignes conservees de chaque flux. Le reste ne sert a personne. */
  readonly keepLines?: number;
}

/**
 * Tout ce qui sort d'un repo passe par ici.
 *
 * La sortie est tronquee par le milieu : le debut dit ce qui a ete lance, la
 * fin dit ce qui a casse. Les dix mille lignes du milieu d'un build turbo
 * n'apprennent rien a personne et coutent un contexte entier.
 */
export function run(command: string, options: RunOptions): Promise<RunResult> {
  const timeoutMs = options.timeoutMs ?? loadConfig().timeouts.commandSeconds * 1000;
  const keepLines = options.keepLines ?? 120;
  const startedAt = Date.now();

  return new Promise<RunResult>((resolve) => {
    const child = spawn(command, {
      cwd: options.cwd,
      shell: true,
      env: childEnv(options.env),
    });

    let stdout = "";
    let stderr = "";
    let timedOut = false;

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
    }, timeoutMs);

    child.stdout?.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    child.on("error", (error) => {
      clearTimeout(timer);
      resolve({
        command,
        cwd: options.cwd,
        exitCode: 127,
        timedOut,
        durationMs: Date.now() - startedAt,
        stdout: "",
        stderr: error.message,
        truncated: false,
      });
    });

    child.on("close", (code) => {
      clearTimeout(timer);
      const out = clip(stdout, keepLines);
      const err = clip(stderr, keepLines);
      resolve({
        command,
        cwd: options.cwd,
        exitCode: timedOut ? 124 : (code ?? 1),
        timedOut,
        durationMs: Date.now() - startedAt,
        stdout: out.text,
        stderr: err.text,
        truncated: out.truncated || err.truncated,
      });
    });
  });
}

/**
 * Des variables du process courant changent le comportement du process fils
 * sans qu'on le demande.
 *
 * Le cas qui nous a mordu : `NODE_TEST_CONTEXT` est pose par `node --test`, et
 * un `node --test` lance dans ce contexte **saute les fichiers et sort 0**. Une
 * suite de tests rendait donc un vert sans avoir rien lance — exactement le
 * faux vert que le red-checker existe pour attraper.
 */
const INHERITED_BUT_HARMFUL = ["NODE_TEST_CONTEXT", "NODE_OPTIONS", "NODE_V8_COVERAGE", "TEST_RUNNER"];

function childEnv(overrides: Readonly<Record<string, string>> | undefined): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env, ...overrides, CI: "1", FORCE_COLOR: "0" };
  for (const key of INHERITED_BUT_HARMFUL) delete env[key];
  return env;
}

export function clip(text: string, keepLines: number): { text: string; truncated: boolean } {
  const lines = text.split("\n");
  if (lines.length <= keepLines * 2) return { text, truncated: false };
  const head = lines.slice(0, keepLines);
  const tail = lines.slice(-keepLines);
  const omitted = lines.length - head.length - tail.length;
  return {
    text: [...head, `… ${omitted} lignes coupees …`, ...tail].join("\n"),
    truncated: true,
  };
}
