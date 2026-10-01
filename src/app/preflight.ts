import { authenticationProblem } from "../adapters/claude-agents.ts";
import { inspectImage, runtimeStatus, startRuntime } from "../adapters/container-runtime.ts";
import { requiredSecrets } from "../adapters/secrets.ts";
import { describeError, fail } from "../domain/failure.ts";
import type { AppContext } from "./context.ts";
import { ensureHome } from "./home.ts";
import { ensureMemory } from "./memory-repository.ts";

export type PreflightStep = "memoire" | "registre" | "jetons" | "claude" | "conteneurs" | "image" | "ticket";

/** One step passed or failed, with what it found; `output` is a line a step's command printed. */
export type PreflightReport = (step: PreflightStep, status: "ok" | "fail" | "output", detail: string) => void;

/** Offers to build a missing image, its output line by line; true once the image exists. */
export type ImageBuild = (image: string, output: (line: string) => void) => Promise<boolean>;

export interface Preflight {
  /** Runs one check: a thrown error is reported as the step's failure, then thrown on. */
  step(name: PreflightStep, check: () => Promise<string> | string): Promise<void>;
  readonly report: PreflightReport;
}

export function preflightOf(report: PreflightReport, signal?: AbortSignal): Preflight {
  return {
    report,
    async step(name, check) {
      if (signal?.aborted) fail("Interrompu avant le debut du run.");
      try {
        report(name, "ok", await check());
      } catch (error) {
        report(name, "fail", describeError(error));
        throw error;
      }
    },
  };
}

/**
 * Everything a run needs before its first task, checked in the order a human can fix it: the
 * memory, the registry, the tokens, Claude's credential, a container runtime, the agent image.
 * `layoutHome` lays the home out, as start does on a first run.
 */
export async function runPreflight(app: AppContext, preflight: Preflight, options: { readonly layoutHome: boolean; readonly build?: ImageBuild }): Promise<void> {
  await preflight.step("memoire", async () => {
    // Cloned before the home lays out its folders, which would otherwise take the clone's place.
    await ensureMemory(app.memoryRepository);
    if (options.layoutHome) await ensureHome(app.paths);
    return app.memoryRepository.separate ? `depot ${app.memoryRepository.url ?? app.memoryRepository.directory}` : "dans le home";
  });
  await preflight.step("registre", () => {
    registryPreflight(app);
    return `${app.configuration.registry.repositories.length} depot(s)`;
  });
  await preflight.step("jetons", () => {
    servicesPreflight(app);
    const { services } = app.configuration.settings;
    const off = [!services.slack && "Slack", !services.figma && "Figma", !services.jiraWrites && "ecritures Jira"].filter(Boolean);
    return off.length ? `presents ; desactives : ${off.join(", ")}` : "presents";
  });
  await preflight.step("claude", () => {
    authenticationPreflight(app);
    return `mode ${app.authentication}`;
  });
  let cli: string | null = null;
  await preflight.step("conteneurs", async () => {
    const status = await containerRuntime(app);
    cli = status.cli;
    return status.detail;
  });
  await preflight.step("image", () => agentImage(app, cli ?? "docker", options.build, (line) => preflight.report("image", "output", line)));
}

/**
 * Agents run in the sandbox image: without a runtime or without the image, the first agent task
 * fails deep in the workflow with a bare exit code. `build` offers to build a missing image.
 */
export async function sandboxPreflight(app: AppContext, options: { build?: ImageBuild } = {}): Promise<void> {
  const status = await containerRuntime(app);
  await agentImage(app, status.cli, options.build, () => {});
}

async function containerRuntime(app: AppContext): Promise<{ readonly cli: string; readonly detail: string }> {
  const probed = await runtimeStatus(app.paths.home);
  const status = probed.available ? probed : await startRuntime(app.paths.home, app.configuration.settings.timeouts.containerStartSeconds * 1000);
  if (!status.available || !status.cli) fail(`Aucun runtime de conteneurs ne repond : ${probed.detail}`, status.detail);
  return { cli: status.cli, detail: status.detail };
}

async function agentImage(app: AppContext, cli: string, build: ImageBuild | undefined, output: (line: string) => void): Promise<string> {
  const image = app.configuration.settings.sandbox.image;
  const inspected = await inspectImage(app.paths.home, cli, image);
  if (inspected.state === "error") fail(`Image des agents ${image} illisible : ${inspected.detail}`, "Le daemon de conteneurs a repondu en erreur : repare-le, puis relance.");
  if (inspected.state === "present") return image;
  if (!(await build?.(image, output))) fail(`Image des agents ${image} absente.`, "Construis-la avec : bun redline image build, ou depuis bun redline init");
  return `${image} construite`;
}

/** Without a registry no repository can be in scope: the run would escalate after framing. */
export function registryPreflight(app: AppContext): void {
  if (!app.configuration.sources.registry) fail(`Aucun registre de repos dans ${app.paths.registry}.`, "Declare tes repos avec : bun redline init");
}

/**
 * The tokens of the services that are on, checked before anything runs: a missing Slack token
 * used to fail the run after its merge requests were open, before the Jira transition.
 */
export function servicesPreflight(app: AppContext): void {
  const missing = requiredSecrets(app.configuration.settings.services).filter((key) => !app.secrets.get(key));
  if (missing.length > 0) {
    fail(`Jetons manquants dans ${app.paths.env} : ${missing.join(", ")}.`, "Renseigne-les, ou desactive le service qui en a besoin, avec : bun redline init");
  }
}

/** A missing credential stops the run here rather than in its first agent task. */
export function authenticationPreflight(app: AppContext): void {
  const problem = authenticationProblem(app.authentication, app.secrets);
  if (problem) fail(`Les agents ne peuvent pas s'authentifier en mode ${app.authentication}.`, problem);
}
