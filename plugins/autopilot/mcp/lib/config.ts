import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fail } from "./errors.ts";
import { expandTilde, projectRoot } from "./paths.ts";
import { parseYaml } from "./yaml.ts";

export type TestKind = "ut" | "it" | "ft" | "ct" | "e2e";
export type CommandKind = TestKind | "lint" | "typecheck";

export interface RepoEntry {
  readonly name: string;
  readonly level: number;
  readonly path: string;
  readonly gitlabProject: string;
  readonly baseBranch: string;
  readonly layer: "front" | "backend" | "data" | "eval";
  readonly packageManager: "npm" | "pnpm" | "yarn";
  readonly monorepoTool: "turbo" | "lerna" | null;
  readonly packageName: string | null;
  readonly dependsOn: readonly string[];
  readonly commands: Readonly<Record<CommandKind, string | null>>;
  readonly ciJobsToWatch: readonly string[];
  readonly description: string;
  readonly keywords: readonly string[];
}

export interface Registry {
  readonly schemaVersion: number;
  readonly repositories: readonly RepoEntry[];
  readonly evalOnly: { readonly repos: readonly string[]; readonly jiraProjects: readonly string[] };
}

export interface AutopilotConfig {
  readonly schemaVersion: number;
  readonly budgets: {
    readonly testAdversary: number;
    readonly redChecker: number;
    readonly testDispute: number;
    readonly greenChecker: number;
    readonly codeAdversary: number;
    readonly disputeBeforeEscalation: number;
  };
  readonly timeouts: {
    readonly ciPipelineSeconds: number;
    readonly askUserSeconds: number;
    readonly repoSetupSeconds: number;
    readonly commandSeconds: number;
  };
  readonly memory: {
    readonly maxNoteLines: number;
    readonly docScout: { readonly maxFilesRead: number; readonly maxOutputLines: number };
  };
  readonly naming: {
    readonly types: readonly string[];
    readonly branch: string;
    readonly mergeRequest: string;
    readonly slackChannel: string;
    readonly devVersionSuffix: string;
    readonly slugMaxLength: number;
    readonly typeFromJiraIssueType: Readonly<Record<string, string>>;
  };
  readonly gitlab: {
    readonly mrDraft: boolean;
    readonly mrDescriptionLanguage: string;
    readonly commitLanguage: string;
    readonly commitConvention: string;
  };
  readonly jira: {
    readonly baseUrl: string;
    readonly assignToSelf: boolean;
    readonly transitions: SquadIndexed<{ readonly apresMr: string }>;
  };
  readonly slack: {
    readonly channelVisibility: "private" | "public";
    readonly invitees: SquadIndexed<readonly string[]>;
  };
  readonly liveMode: { readonly portRange: readonly [number, number]; readonly openBrowser: boolean };
}

/**
 * Une seule forme pour tout ce qui varie d'une equipe a l'autre. Les cles de
 * reglage restent en dehors de `bySquad` : sans cette separation, le code doit
 * maintenir une liste noire de cles reservees, et le jour ou une squad s'appelle
 * comme un reglage, le bug est silencieux.
 */
export interface SquadIndexed<T> {
  readonly default: T;
  readonly bySquad: Readonly<Record<string, T>>;
}

let configCache: AutopilotConfig | null = null;
let registryCache: Registry | null = null;

export function loadConfig(): AutopilotConfig {
  if (configCache) return configCache;
  const path = join(projectRoot(), "autopilot.yaml");
  const raw = readOrFail(path, "autopilot.yaml");
  const parsed = parseYaml<AutopilotConfig>(raw);
  if (parsed?.schemaVersion !== 1) {
    fail(`autopilot.yaml : schemaVersion ${String(parsed?.schemaVersion)} inconnue, attendu 1.`);
  }
  configCache = parsed;
  return parsed;
}

export function loadRegistry(): Registry {
  if (registryCache) return registryCache;
  const path = join(projectRoot(), "repositories.yaml");
  const raw = readOrFail(path, "repositories.yaml");
  const parsed = parseYaml<Registry>(raw);
  if (parsed?.schemaVersion !== 1) {
    fail(`repositories.yaml : schemaVersion ${String(parsed?.schemaVersion)} inconnue, attendu 1.`);
  }
  assertRegistryCoherent(parsed);
  registryCache = parsed;
  return parsed;
}

/** Les tests reconstruisent la config a chaque cas : le cache doit pouvoir tomber. */
export function resetConfigCache(): void {
  configCache = null;
  registryCache = null;
}

export function findRepo(name: string): RepoEntry {
  const repo = loadRegistry().repositories.find((r) => r.name === name);
  if (!repo) {
    const known = loadRegistry().repositories.map((r) => r.name).join(", ");
    fail(`Repo inconnu du registre : ${name}.`, `Repos declares : ${known}`);
  }
  return repo;
}

export function repoRoot(repo: RepoEntry): string {
  return expandTilde(repo.path);
}

/** Ordre de traitement : amont vers aval, `level` croissant, nom en depart d'egalite. */
export function orderByLevel(repos: readonly RepoEntry[]): readonly RepoEntry[] {
  return [...repos].sort((a, b) => a.level - b.level || a.name.localeCompare(b.name));
}

/**
 * Resolution par squad, en deux temps : `bySquad[squad]`, sinon `default`.
 * Pas d'heritage implicite, pas de resolution partielle.
 *
 * La comparaison est insensible a la casse : `FT`, `Ft` et `ft` designent la
 * meme squad. Une resolution sensible a la casse produirait un repli silencieux
 * sur `default`, donc un canal sans personne dedans et aucun message d'erreur.
 */
export function resolveBySquad<T>(indexed: SquadIndexed<T>, squad: string): T {
  const wanted = squad.trim().toLowerCase();
  for (const [key, value] of Object.entries(indexed.bySquad ?? {})) {
    if (key.trim().toLowerCase() === wanted) return value;
  }
  return indexed.default;
}

/** La squad d'un ticket, c'est le prefixe de sa cle Jira : `FT` dans `FT-1025`. */
export function squadOf(ticketKey: string): string {
  const match = /^([A-Za-z][A-Za-z0-9_]*)-\d+$/.exec(ticketKey.trim());
  if (!match?.[1]) {
    fail(`Cle Jira mal formee : ${ticketKey}.`, "Attendu <PROJET>-<numero>, par exemple FT-1025.");
  }
  return match[1].toUpperCase();
}

/**
 * Un repo de banc d'essai ne doit jamais tomber dans le perimetre d'un vrai
 * ticket, et un vrai repo ne doit jamais etre touche par un ticket de test.
 */
export function isRepoEligible(repo: RepoEntry, ticketKey: string): boolean {
  const { evalOnly } = loadRegistry();
  const squad = squadOf(ticketKey);
  const isEvalTicket = evalOnly.jiraProjects.some((p) => p.toUpperCase() === squad);
  const isEvalRepo = evalOnly.repos.includes(repo.name);
  return isEvalTicket === isEvalRepo;
}

export function commandFor(repo: RepoEntry, kind: CommandKind): string | null {
  return repo.commands?.[kind] ?? null;
}

function readOrFail(path: string, label: string): string {
  try {
    return readFileSync(path, "utf8");
  } catch {
    return fail(`${label} introuvable a ${path}.`, "Le tool tourne-t-il depuis le projet autopilot ?");
  }
}

/**
 * Deux incoherences de registre cassent le run tres loin de leur cause : une
 * dependance vers un repo inexistant, et une dependance qui remonte le courant.
 * Les deux se detectent ici, au chargement, pour une lecture de fichier.
 */
function assertRegistryCoherent(registry: Registry): void {
  const byName = new Map(registry.repositories.map((r) => [r.name, r]));
  for (const repo of registry.repositories) {
    for (const upstream of repo.dependsOn ?? []) {
      const target = byName.get(upstream);
      if (!target) {
        fail(`repositories.yaml : ${repo.name} dependsOn ${upstream}, qui n'est pas declare.`);
      }
      if (target.level >= repo.level) {
        fail(
          `repositories.yaml : ${repo.name} (level ${repo.level}) dependsOn ${upstream} (level ${target.level}).`,
          "Un repo amont doit avoir un level strictement inferieur, sinon l'ordre de traitement ne veut plus rien dire.",
        );
      }
    }
  }
}
