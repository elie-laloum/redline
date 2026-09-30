import { run as execute } from "../../adapters/exec.ts";
import { fill } from "../../domain/naming.ts";
import { Escalation } from "../../workflow/escalation.ts";
import { commitWork } from "./commit.ts";
import type { DeliveryContext, RepoTarget } from "./context.ts";
import { git } from "../../adapters/git.ts";

export interface Upgrade {
  readonly package: string;
  readonly version: string;
}

export async function applyUpgrades(run: DeliveryContext, target: RepoTarget, directory: string, upgrades: readonly Upgrade[]): Promise<string[]> {
  if (upgrades.length === 0) return [];
  const key = `${target.repo.name}.workspace`;
  const template = target.repo.bump ?? fail(key, `${target.repo.name} doit adopter ${upgrades.map((upgrade) => upgrade.package).join(", ")} mais le registre ne declare pas de commande bump`);
  const { settings } = run.app.configuration;
  const baseline = await git(directory, ["rev-parse", "HEAD"]);
  for (const upgrade of upgrades) {
    const command = fill(template, { package: upgrade.package, version: upgrade.version });
    const seconds = settings.timeouts.repoSetupSeconds;
    const result = await execute(command, { cwd: directory, timeoutMs: seconds * 1000, silenceMs: seconds * 1000, ...(run.signal ? { signal: run.signal } : {}) });
    if (result.exitCode !== 0) fail(key, `\`${command}\` a echoue : ${(result.stderr || result.stdout).trim().slice(-800)}`);
  }
  const names = upgrades.map((upgrade) => `${upgrade.package}@${upgrade.version}`);
  await commitWork({
    directory,
    zone: "code",
    baseline,
    intent: { type: "build", scope: "deps", subject: `bump ${names.join(", ")}` },
    fallback: { type: "build", subject: "bump dependencies" },
    ticket: run.ledger.key,
    ...(settings.git.committer ? { committer: settings.git.committer } : {}),
  });
  return names;
}

function fail(key: string, detail: string): never {
  throw new Escalation("environment", key, detail);
}
