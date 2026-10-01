import { spawn } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import * as clack from "@clack/prompts";
import { createContext } from "../../app/context.ts";
import { sandboxPreflight } from "../../app/preflight.ts";

const ROOT = resolve(import.meta.dir, "..", "..", "..");

function outpost(args: readonly string[]): Promise<number> {
  const cli = join(dirname(fileURLToPath(import.meta.resolve("@elie-laloum/outpost"))), "cli", "main.js");
  return new Promise((done) => {
    const child = spawn(process.execPath, ["--no-env-file", cli, ...args], { stdio: "inherit", cwd: ROOT });
    child.on("exit", (code) => done(code ?? 1));
  });
}

export function buildImage(image: string): Promise<number> {
  const uid = String(process.getuid?.() ?? 1000);
  const gid = String(process.getgid?.() ?? 1000);
  return outpost(["image", "build", "--directory", ROOT, "--file", join(ROOT, "docker", "agent.Dockerfile"), "--image", image, "--uid", uid, "--gid", gid]);
}

export async function imageBuildCommand(): Promise<number> {
  const image = createContext().configuration.settings.sandbox.image;
  clack.intro(`Construction de l'image ${image}`);
  const code = await buildImage(image);
  clack.outro(code === 0 ? `${image} prete.` : "La construction a echoue.");
  return code;
}

/** For start and resume: builds the missing agent image once the human agrees. */
export async function offerImageBuild(image: string): Promise<boolean> {
  if (!process.stdin.isTTY) return false;
  const agreed = await clack.confirm({ message: `L'image des agents ${image} n'existe pas encore. La construire maintenant ?` });
  if (clack.isCancel(agreed) || !agreed) return false;
  const code = await buildImage(image);
  if (code === 0) clack.log.success(`${image} prete.`);
  else clack.log.error("La construction a echoue.");
  return code === 0;
}

export async function imageDoctorCommand(): Promise<number> {
  const app = createContext();
  const image = app.configuration.settings.sandbox.image;
  await sandboxPreflight(app);
  return outpost(["doctor", "--sandbox-provider", "docker", "--agent", "claude", "--image", image]);
}
