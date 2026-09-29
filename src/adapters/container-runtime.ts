import { run } from "./exec.ts";

export interface RuntimeStatus {
  readonly available: boolean;
  readonly cli: "docker" | "podman" | null;
  readonly vm: "colima" | "docker-desktop" | null;
  readonly detail: string;
}

export interface ImageReport {
  readonly image: string;
  readonly present: boolean;
  readonly pulled: boolean;
  readonly error: string | null;
}

const PROBE_MS = 20_000;
const IMAGE = /^[A-Za-z0-9._\-/:@]+$/;

function probe(command: string, cwd: string, timeoutMs = PROBE_MS) {
  return run(command, { cwd, timeoutMs, silenceMs: timeoutMs, keepLines: 20 });
}

export async function runtimeStatus(cwd: string): Promise<RuntimeStatus> {
  const docker = await probe("docker info --format '{{.ServerVersion}}'", cwd);
  if (docker.exitCode === 0) {
    const context = (await probe("docker context show", cwd, 10_000)).stdout.trim();
    const vm = context.includes("colima") ? "colima" : context.includes("desktop") ? "docker-desktop" : null;
    return { available: true, cli: "docker", vm, detail: `docker repond (serveur ${docker.stdout.trim() || "?"}).` };
  }
  const podman = await probe("podman info --format '{{.Version.Version}}'", cwd);
  if (podman.exitCode === 0) return { available: true, cli: "podman", vm: null, detail: "podman repond." };
  const detail = (docker.stderr || docker.stdout || "aucun runtime de conteneurs ne repond").trim().split("\n")[0] ?? "";
  return { available: false, cli: null, vm: null, detail };
}

export async function startRuntime(cwd: string, timeoutMs: number): Promise<RuntimeStatus> {
  if ((await probe("command -v colima", cwd, 5_000)).exitCode !== 0) {
    return { available: false, cli: null, vm: null, detail: "Aucun runtime ne repond et colima n'est pas installe : demarre Docker." };
  }
  const started = await run("colima start", { cwd, timeoutMs, silenceMs: timeoutMs, keepLines: 40 });
  if (started.exitCode !== 0) {
    return { available: false, cli: null, vm: "colima", detail: `colima start a echoue : ${(started.stderr || started.stdout).trim().slice(-400)}` };
  }
  return runtimeStatus(cwd);
}

export async function ensureImages(cwd: string, cli: string, images: readonly string[], timeoutMs: number): Promise<ImageReport[]> {
  const reports: ImageReport[] = [];
  for (const image of images) {
    if (!IMAGE.test(image)) {
      reports.push({ image, present: false, pulled: false, error: "nom d'image refuse" });
      continue;
    }
    if ((await probe(`${cli} image inspect ${image}`, cwd, 15_000)).exitCode === 0) {
      reports.push({ image, present: true, pulled: false, error: null });
      continue;
    }
    const pulled = await run(`${cli} pull ${image}`, { cwd, timeoutMs, silenceMs: timeoutMs, keepLines: 30 });
    const ok = pulled.exitCode === 0;
    reports.push({ image, present: ok, pulled: ok, error: ok ? null : (pulled.stderr || pulled.stdout).trim().slice(-300) });
  }
  return reports;
}
