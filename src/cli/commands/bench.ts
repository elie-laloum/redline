import { existsSync } from "node:fs";
import * as clack from "@clack/prompts";
import { createContext } from "../../app/context.ts";
import { expandTilde } from "../../app/paths.ts";
import { COMMAND_KINDS, type CommandKind } from "../../domain/config.ts";

export async function benchCommand(repos: readonly string[], options: { kinds?: string }): Promise<number> {
  const app = createContext();
  const kinds = (options.kinds?.split(",").map((kind) => kind.trim()) ?? [...COMMAND_KINDS]).filter((kind): kind is CommandKind => (COMMAND_KINDS as readonly string[]).includes(kind));
  const selected = app.configuration.registry.repositories.filter((repo) => repos.length === 0 || repos.includes(repo.name));
  const checks = app.checks("bench");
  const silence = app.configuration.settings.timeouts.commandSilenceSeconds;
  clack.intro(`Banc des commandes du registre (silence tolere : ${silence}s)`);
  let failures = 0;
  for (const repo of selected) {
    const path = expandTilde(repo.path);
    if (!existsSync(path)) {
      clack.log.warn(`${repo.name} : absent du disque (${path})`);
      continue;
    }
    for (const kind of kinds.filter((candidate) => repo.commands[candidate] !== null)) {
      const spinner = clack.spinner();
      spinner.start(`${repo.name} ${kind}`);
      const result = await checks.run(repo, kind, path, { label: `bench-${repo.name}-${kind}` });
      const seconds = (ms: number) => `${(ms / 1000).toFixed(1)}s`;
      const verdict = result.passed ? "✓" : result.stopReason ? "⏱" : "✗";
      if (!result.passed) failures += 1;
      spinner.stop(`${verdict} ${repo.name} ${kind} — ${seconds(result.durationMs)}, plus long silence ${seconds(result.maxSilentMs)}${result.stopReason ? ` — ${result.stopReason}` : ""}`);
    }
  }
  clack.outro(failures ? `${failures} commande(s) en echec : a verifier avant un run.` : "Toutes les commandes passent.");
  return failures ? 1 : 0;
}
