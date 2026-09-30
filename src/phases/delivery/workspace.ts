import { existsSync } from "node:fs";
import { join } from "node:path";
import { defineTask, type Task } from "@elie-laloum/outpost";
import { ensureImages, runtimeStatus, startRuntime } from "../../adapters/container-runtime.ts";
import { run as execute, stopReason } from "../../adapters/exec.ts";
import { git, gitAllowFailure } from "../../adapters/git.ts";
import { installCommand } from "../../domain/monorepo.ts";
import { Escalation } from "../../workflow/escalation.ts";
import { applyUpgrades } from "./bump.ts";
import { commandObserver } from "../run.ts";
import { type DeliveryContext, type RepoTarget, withTarget } from "./context.ts";
import type { Release } from "./summary.ts";

export interface Prepared {
  readonly repo: string;
  readonly directory: string;
  readonly branch: string;
  readonly base: string;
  readonly bumps: readonly string[];
}

export interface Upstream {
  readonly package: string;
  readonly release: Task<Release>;
}

export function workspaceTask(run: DeliveryContext, target: RepoTarget, after: readonly Task[], upstream: readonly Upstream[]): Task<Prepared> {
  const key = `${target.repo.name}.workspace`;
  return defineTask({
    key,
    after: [...after, ...upstream.map((entry) => entry.release)],
    async perform(context) {
      const fetched = await gitAllowFailure(target.path, ["fetch", "-q", "origin", target.repo.baseBranch]);
      if (!fetched.ok) throw new Escalation("environment", key, `git fetch origin ${target.repo.baseBranch} a echoue : ${fetched.stderr}`);
      return withTarget(run, target, async (workspace) => {
        const base = await git(workspace.directory, ["merge-base", "HEAD", `origin/${target.repo.baseBranch}`]);
        const upgrades = upstream.map((entry) => ({ package: entry.package, version: context.value(entry.release).version }));
        const bumps = await applyUpgrades(run, target, workspace.directory, upgrades);
        await install(run, target, workspace.directory, bumps.length > 0);
        await preflight(run, target, workspace.directory);
        return { repo: target.repo.name, directory: workspace.directory, branch: workspace.branch, base, bumps };
      });
    },
  });
}

async function install(run: DeliveryContext, target: RepoTarget, directory: string, force: boolean): Promise<void> {
  if (!existsSync(join(directory, "package.json"))) return;
  if (!force && existsSync(join(directory, "node_modules"))) return;
  const seconds = run.app.configuration.settings.timeouts.repoSetupSeconds;
  const command = installCommand(target.repo.packageManager);
  const observe = commandObserver(run, `${target.repo.name}.workspace`, "install");
  observe?.start(command);
  const result = await execute(command, {
    cwd: directory,
    timeoutMs: seconds * 1000,
    silenceMs: seconds * 1000,
    ...(observe ? { onProgress: observe.progress } : {}),
    ...(run.signal ? { signal: run.signal } : {}),
  });
  observe?.end({ elapsedMs: result.durationMs, exitCode: result.exitCode, passed: result.exitCode === 0, logPath: result.logPath });
  if (result.exitCode !== 0) {
    throw new Escalation("environment", `${target.repo.name}.workspace`, `installation des dependances en echec : ${stopReason(result) ?? (result.stderr || result.stdout).trim().slice(-800)}`);
  }
}

async function preflight(run: DeliveryContext, target: RepoTarget, directory: string): Promise<void> {
  const needs = target.repo.containers;
  if (!needs.required && needs.images.length === 0) return;
  const { timeouts } = run.app.configuration.settings;
  let status = await runtimeStatus(directory);
  if (!status.available) status = await startRuntime(directory, timeouts.containerStartSeconds * 1000);
  if (!status.available || !status.cli) {
    if (needs.required) throw new Escalation("environment", `${target.repo.name}.workspace`, `aucun runtime de conteneurs : ${status.detail}`);
    return;
  }
  const missing = (await ensureImages(directory, status.cli, needs.images, timeouts.imagePullSeconds * 1000)).filter((image) => !image.present);
  if (missing.length > 0 && needs.required) {
    throw new Escalation("environment", `${target.repo.name}.workspace`, `images indisponibles : ${missing.map((image) => `${image.image} (${image.error})`).join(", ")}`);
  }
}
