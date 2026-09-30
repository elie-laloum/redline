import * as clack from "@clack/prompts";
import { AUTH_LABELS, AUTH_SECRETS, authenticationProblem } from "../../adapters/claude-agents.ts";
import { loadSecrets, writeSecret } from "../../adapters/secrets.ts";
import { createContext } from "../../app/context.ts";
import { homeDirectory, pathsOf } from "../../app/paths.ts";
import { writeSetting } from "../../app/settings.ts";
import type { AuthMode } from "../../domain/config.ts";
import { fail } from "../../domain/failure.ts";

const SECRET_HINTS: Readonly<Record<AuthMode, string>> = {
  account: "",
  oauth: "le jeton que rend claude setup-token",
  key: "une cle creee sur console.anthropic.com",
};

export async function authCommand(mode: AuthMode | undefined): Promise<number> {
  if (!mode) return showMode();
  const paths = pathsOf(homeDirectory());
  clack.intro(`redline auth ${mode}`);
  writeSetting(paths, ["agents", "authentication"], mode);
  clack.log.success(`Mode ${mode} enregistre dans ${paths.settings} : ${AUTH_LABELS[mode]}.`);
  const secret = AUTH_SECRETS[mode];
  if (secret && !loadSecrets(paths.env).get(secret)) {
    if (!process.stdin.isTTY) fail(`${secret} manquant dans ${paths.env}.`, `Ajoute la ligne ${secret}=... ou relance bun redline auth ${mode} dans un terminal.`);
    const value = await clack.password({ message: `${secret} (${SECRET_HINTS[mode]})`, validate: (text) => (text?.trim() ? undefined : "Un jeton vide n'authentifie rien.") });
    if (clack.isCancel(value)) {
      clack.outro(`${secret} reste a renseigner dans ${paths.env}.`);
      return 1;
    }
    writeSecret(paths.env, secret, value.trim());
    clack.log.success(`${secret} enregistre dans ${paths.env}.`);
  }
  return showProblem(mode);
}

function showMode(): number {
  const app = createContext();
  clack.intro("redline auth");
  clack.log.info(`Mode ${app.authentication} : ${AUTH_LABELS[app.authentication]}.`);
  return showProblem(app.authentication, "Change-le avec : bun redline auth <account|oauth|key>");
}

function showProblem(mode: AuthMode, outro = "Pret."): number {
  const problem = authenticationProblem(mode, createContext().secrets);
  if (problem) {
    clack.log.warn(problem);
    clack.outro("Les agents ne pourront pas s'authentifier dans ce mode.");
    return 1;
  }
  clack.outro(outro);
  return 0;
}
