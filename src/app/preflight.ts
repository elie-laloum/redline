import { authenticationProblem } from "../adapters/claude-agents.ts";
import { requiredSecrets } from "../adapters/secrets.ts";
import { inspectImage, runtimeStatus, startRuntime } from "../adapters/container-runtime.ts";
import { fail } from "../domain/failure.ts";
import type { AppContext } from "./context.ts";

/**
 * Agents run in the sandbox image: without a runtime or without the image, the first agent task
 * fails deep in the workflow with a bare exit code. `build` offers to build a missing image and
 * says whether it now exists.
 */
export async function sandboxPreflight(app: AppContext, options: { build?: (image: string) => Promise<boolean> } = {}): Promise<void> {
  const { settings } = app.configuration;
  const probed = await runtimeStatus(app.paths.home);
  const status = probed.available ? probed : await startRuntime(app.paths.home, settings.timeouts.containerStartSeconds * 1000);
  if (!status.available || !status.cli) fail(`Aucun runtime de conteneurs ne repond : ${probed.detail}`, status.detail);
  const image = settings.sandbox.image;
  const inspected = await inspectImage(app.paths.home, status.cli, image);
  if (inspected.state === "error") fail(`Image des agents ${image} illisible : ${inspected.detail}`, "Le daemon de conteneurs a repondu en erreur : repare-le, puis relance.");
  if (inspected.state === "absent" && !(await options.build?.(image))) fail(`Image des agents ${image} absente.`, "Construis-la avec : bun redline image build");
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
