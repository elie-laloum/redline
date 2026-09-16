import { spawn } from "node:child_process";
import { loadConfig } from "./config.ts";

export interface RunResult {
  readonly command: string;
  readonly cwd: string;
  readonly exitCode: number;
  readonly timedOut: boolean;
  /**
   * Pourquoi la commande s'est arretee. `silence` dit quelque chose que
   * `timeout` ne dit pas : le process etait vivant mais n'ecrivait plus rien,
   * ce qui est la signature d'une attente d'infrastructure — un `docker pull`
   * sans daemon, un conteneur qui ne demarre pas — et pas d'un test lent.
   */
  readonly stoppedBy: "exit" | "timeout" | "silence";
  readonly durationMs: number;
  /** Delai ecoule depuis la derniere ligne recue, au moment ou on a rendu. */
  readonly silentForMs: number;
  /**
   * Le plus long silence traverse par la commande.
   *
   * C'est ce chiffre qui calibre `commandSilenceSeconds`, pas une intuition :
   * une suite qui se tait 90 secondes pendant son build interdit un seuil a 60,
   * et le savoir demande de l'avoir mesure une fois.
   */
  readonly maxSilentMs: number;
  readonly stdout: string;
  readonly stderr: string;
  readonly truncated: boolean;
}

export interface RunOptions {
  readonly cwd: string;
  readonly timeoutMs?: number;
  /**
   * Silence tolere avant abandon. Une commande qui n'a rien ecrit depuis ce
   * delai est abandonnee, meme s'il lui reste du temps au plafond global.
   */
  readonly silenceMs?: number;
  readonly env?: Readonly<Record<string, string>>;
  /** Nombre de lignes conservees de chaque flux. Le reste ne sert a personne. */
  readonly keepLines?: number;
  /**
   * Appele regulierement tant que la commande tourne. C'est ce qui empeche le
   * client MCP de prendre un test long pour un appel mort : cote client, un
   * appel silencieux finit tue, et le tool n'a aucun moyen de plaider sa cause
   * apres coup.
   */
  readonly onProgress?: (message: string) => void;
}

/**
 * Tout ce qui sort d'un repo passe par ici.
 *
 * La sortie est tronquee par le milieu : le debut dit ce qui a ete lance, la
 * fin dit ce qui a casse. Les dix mille lignes du milieu d'un build turbo
 * n'apprennent rien a personne et coutent un contexte entier.
 */
export function run(command: string, options: RunOptions): Promise<RunResult> {
  const timeouts = loadConfig().timeouts;
  const timeoutMs = options.timeoutMs ?? timeouts.commandSeconds * 1000;
  const silenceMs = options.silenceMs ?? timeouts.commandSilenceSeconds * 1000;
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
    let lastOutputAt = startedAt;
    let maxSilentMs = 0;
    let stoppedBy: "exit" | "timeout" | "silence" = "exit";

    const timer = setTimeout(() => {
      stoppedBy = "timeout";
      child.kill("SIGKILL");
    }, timeoutMs);

    /**
     * Deux horloges, pas une.
     *
     * Le plafond global borne une commande lente ; le silence attrape une
     * commande bloquee. Les confondre coute la difference entre les deux : sur
     * FT-1042, une suite de tests a occupe trente minutes de plafond sans
     * jamais ecrire une ligne parce qu'aucun daemon de conteneurs ne repondait,
     * puis la meme commande a rendu en vingt-et-une secondes une fois le
     * daemon la. Le silence le disait des la premiere minute.
     */
    const watchdog = setInterval(() => {
      const silentFor = Date.now() - lastOutputAt;
      if (silenceMs > 0 && silentFor >= silenceMs) {
        stoppedBy = "silence";
        clearInterval(watchdog);
        child.kill("SIGKILL");
        return;
      }
      options.onProgress?.(`${command.slice(0, 60)} — ${Math.round((Date.now() - startedAt) / 1000)}s`);
    }, Math.max(1000, Math.min(PROGRESS_EVERY_MS, silenceMs > 0 ? silenceMs / 2 : PROGRESS_EVERY_MS)));

    const record = (chunk: Buffer, into: "out" | "err"): void => {
      const now = Date.now();
      maxSilentMs = Math.max(maxSilentMs, now - lastOutputAt);
      lastOutputAt = now;
      if (into === "out") stdout += chunk.toString();
      else stderr += chunk.toString();
    };

    child.stdout?.on("data", (chunk: Buffer) => record(chunk, "out"));
    child.stderr?.on("data", (chunk: Buffer) => record(chunk, "err"));

    const done = (result: Omit<RunResult, "command" | "cwd" | "durationMs" | "silentForMs" | "maxSilentMs">): void => {
      clearTimeout(timer);
      clearInterval(watchdog);
      const silentForMs = Date.now() - lastOutputAt;
      resolve({
        ...result,
        command,
        cwd: options.cwd,
        durationMs: Date.now() - startedAt,
        silentForMs,
        maxSilentMs: Math.max(maxSilentMs, silentForMs),
      });
    };

    child.on("error", (error) => {
      done({ exitCode: 127, timedOut: false, stoppedBy: "exit", stdout: "", stderr: error.message, truncated: false });
    });

    child.on("close", (code) => {
      const out = clip(stdout, keepLines);
      const err = clip(stderr, keepLines);
      done({
        exitCode: stoppedBy === "exit" ? (code ?? 1) : 124,
        timedOut: stoppedBy !== "exit",
        stoppedBy,
        stdout: out.text,
        stderr: err.text,
        truncated: out.truncated || err.truncated,
      });
    });
  });
}

/** Rythme des battements vers le client, quand le silence tolere est large. */
const PROGRESS_EVERY_MS = 15_000;

/**
 * Ce qu'on dit d'une commande abandonnee, pour que l'agent qui le lit sache
 * ou chercher. Un `timedOut: true` nu envoie chercher un test lent ; neuf fois
 * sur dix c'est l'environnement qui ne repond pas.
 */
export function stopReason(result: RunResult): string | null {
  if (result.stoppedBy === "exit") return null;
  if (result.stoppedBy === "silence") {
    return (
      `Commande abandonnee apres ${Math.round(result.silentForMs / 1000)}s sans la moindre sortie. ` +
      "Un process vivant mais muet, c'est une attente d'infrastructure, pas un test lent : " +
      "verifie le runtime de conteneurs, la base et les ports avant de soupconner le code."
    );
  }
  return (
    `Commande abandonnee au plafond de ${Math.round(result.durationMs / 1000)}s. ` +
    "Elle ecrivait encore : c'est une commande reellement longue, pas un blocage."
  );
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
