import { run } from "./exec.ts";

/**
 * Le runtime de conteneurs, avant qu'on en ait besoin.
 *
 * Un repo dont les tests montent une base dans un conteneur ne peut pas etre
 * verifie si aucun daemon ne repond. Le probleme n'est pas qu'il echoue : c'est
 * qu'il n'echoue pas franchement. La commande reste pendue jusqu'au plafond,
 * l'agent lit un timeout, et rien dans ce timeout ne dit que le daemon est
 * arrete. Sur FT-1042 ca a coute cinquante minutes pour une suite qui tourne en
 * vingt-et-une secondes.
 *
 * Tout se detecte avant, pour trois commandes qui rendent en une seconde.
 */

export interface ContainerNeeds {
  /** Le repo ne peut pas etre teste sans runtime de conteneurs. */
  readonly required: boolean;
  /** Images a avoir en cache local avant le premier test. */
  readonly images: readonly string[];
}

export interface RuntimeStatus {
  readonly available: boolean;
  /** Le binaire qui repond : `docker`, `podman`, ou rien. */
  readonly cli: string | null;
  /** La machine qui l'heberge sur macOS, quand il y en a une. */
  readonly vm: "colima" | "docker-desktop" | null;
  readonly detail: string;
}

const PROBE_MS = 20_000;

/** Un probe ne doit jamais devenir l'attente qu'il sert a eviter. */
function probe(command: string, cwd: string, timeoutMs = PROBE_MS) {
  return run(command, { cwd, timeoutMs, silenceMs: timeoutMs, keepLines: 20 });
}

export async function runtimeStatus(cwd: string): Promise<RuntimeStatus> {
  const docker = await probe("docker info --format '{{.ServerVersion}}'", cwd);
  if (docker.exitCode === 0) {
    return {
      available: true,
      cli: "docker",
      vm: await hostingVm(cwd),
      detail: `docker repond (serveur ${docker.stdout.trim() || "version inconnue"}).`,
    };
  }

  const podman = await probe("podman info --format '{{.Version.Version}}'", cwd);
  if (podman.exitCode === 0) {
    return { available: true, cli: "podman", vm: null, detail: "podman repond." };
  }

  return {
    available: false,
    cli: null,
    vm: null,
    detail: (docker.stderr || docker.stdout || "aucun runtime de conteneurs ne repond").trim().split("\n")[0] ?? "",
  };
}

async function hostingVm(cwd: string): Promise<"colima" | "docker-desktop" | null> {
  const context = await probe("docker context show", cwd, 10_000);
  const name = context.stdout.trim();
  if (name.includes("colima")) return "colima";
  if (name.includes("desktop")) return "docker-desktop";
  return null;
}

/**
 * Demarrer la machine, une fois, plutot que d'escalader.
 *
 * On ne tente que `colima start` : c'est la seule machine qu'un `start` en
 * ligne de commande rend reellement utilisable sans interface graphique. Pour
 * Docker Desktop, la bonne reponse est de le dire a l'humain, pas d'ouvrir une
 * application dans son dos.
 */
export async function startRuntime(cwd: string, timeoutMs: number): Promise<RuntimeStatus> {
  const colima = await probe("command -v colima", cwd, 5_000);
  if (colima.exitCode !== 0) {
    return {
      available: false,
      cli: null,
      vm: null,
      detail: "Aucun runtime ne repond et colima n'est pas installe : demarre Docker Desktop, ou installe colima.",
    };
  }

  const started = await run("colima start", { cwd, timeoutMs, silenceMs: timeoutMs, keepLines: 40 });
  if (started.exitCode !== 0) {
    return {
      available: false,
      cli: null,
      vm: "colima",
      detail: `colima start a echoue : ${(started.stderr || started.stdout).trim().slice(-400)}`,
    };
  }
  return runtimeStatus(cwd);
}

export interface ImageReport {
  readonly image: string;
  readonly present: boolean;
  readonly pulled: boolean;
  readonly durationMs: number;
  readonly error: string | null;
}

/**
 * Les images d'abord, les tests ensuite.
 *
 * Un premier `docker pull` de plusieurs centaines de megaoctets se produit
 * sinon **pendant** la premiere suite de tests, ou il est indiscernable d'un
 * test lent : meme silence, meme timeout, et un agent qui part chercher un bug
 * dans le code. Tire au pre-vol, il est visible et il ne se reproduit plus.
 */
export async function ensureImages(
  cwd: string,
  cli: string,
  images: readonly string[],
  timeoutMs: number,
): Promise<ImageReport[]> {
  const reports: ImageReport[] = [];
  for (const image of images) {
    const known = await probe(`${cli} image inspect ${quote(image)}`, cwd, 15_000);
    if (known.exitCode === 0) {
      reports.push({ image, present: true, pulled: false, durationMs: known.durationMs, error: null });
      continue;
    }
    const pulled = await run(`${cli} pull ${quote(image)}`, { cwd, timeoutMs, silenceMs: timeoutMs, keepLines: 30 });
    reports.push({
      image,
      present: pulled.exitCode === 0,
      pulled: pulled.exitCode === 0,
      durationMs: pulled.durationMs,
      error: pulled.exitCode === 0 ? null : (pulled.stderr || pulled.stdout).trim().slice(-300),
    });
  }
  return reports;
}

/** Un tag d'image ne contient jamais de quote ; on refuse plutot que d'echapper. */
function quote(image: string): string {
  if (!/^[A-Za-z0-9._\-/:@]+$/.test(image)) {
    throw new Error(`Nom d'image refuse : ${image}. Attendu depot:tag, sans espace ni quote.`);
  }
  return image;
}
