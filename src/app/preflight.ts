import { authenticationProblem } from "../adapters/claude-agents.ts";
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

/** A missing credential stops the run here rather than in its first agent task. */
export function authenticationPreflight(app: AppContext): void {
  const problem = authenticationProblem(app.authentication, app.secrets);
  if (problem) fail(`Les agents ne peuvent pas s'authentifier en mode ${app.authentication}.`, problem);
}
