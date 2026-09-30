import { spawn } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import * as clack from "@clack/prompts";
import { createContext } from "../../app/context.ts";

const ROOT = resolve(import.meta.dir, "..", "..", "..");

function outpost(args: readonly string[]): Promise<number> {
  const cli = join(dirname(fileURLToPath(import.meta.resolve("@elie-laloum/outpost"))), "cli", "main.js");
  return new Promise((done) => {
    const child = spawn(process.execPath, [cli, ...args], { stdio: "inherit", cwd: ROOT });
    child.on("exit", (code) => done(code ?? 1));
  });
}

export async function imageBuildCommand(): Promise<number> {
  const image = createContext().configuration.settings.sandbox.image;
  clack.intro(`Construction de l'image ${image}`);
  const uid = String(process.getuid?.() ?? 1000);
  const gid = String(process.getgid?.() ?? 1000);
  const code = await outpost(["image", "build", "--directory", ROOT, "--file", join(ROOT, "docker", "agent.Dockerfile"), "--image", image, "--uid", uid, "--gid", gid]);
  clack.outro(code === 0 ? `${image} prete.` : "La construction a echoue.");
  return code;
}

export async function imageDoctorCommand(): Promise<number> {
  const image = createContext().configuration.settings.sandbox.image;
  return outpost(["doctor", "--sandbox-provider", "docker", "--agent", "claude", "--image", image]);
}
