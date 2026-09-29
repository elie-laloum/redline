import * as v from "valibot";
import { ROLE_NAMES } from "./roles.ts";

export const TEST_KINDS = ["ut", "it", "ft", "ct", "e2e"] as const;
export const COMMAND_KINDS = [...TEST_KINDS, "lint", "typecheck"] as const;
export type TestKind = (typeof TEST_KINDS)[number];
export type CommandKind = (typeof COMMAND_KINDS)[number];

const text = v.pipe(v.string(), v.trim(), v.minLength(1));
const count = v.pipe(v.number(), v.integer(), v.minValue(0));
const positive = v.pipe(v.number(), v.integer(), v.minValue(1));
const insideRepo = v.pipe(
  text,
  v.check((path) => !path.startsWith("/") && !path.split(/[\\/]/).includes(".."), "chemin relatif, sans .."),
);

function perKind<S extends v.GenericSchema>(item: S) {
  return v.partial(v.object({ lint: item, typecheck: item, ut: item, it: item, ft: item, ct: item, e2e: item }));
}

function squadIndexed<S extends v.GenericSchema>(item: S) {
  return v.object({ default: item, bySquad: v.optional(v.record(v.string(), item), {}) });
}

const command = v.nullable(text);

export const RepoSchema = v.object({
  name: v.pipe(v.string(), v.regex(/^[A-Za-z0-9][A-Za-z0-9._-]*$/, "nom de repo invalide")),
  level: count,
  path: text,
  gitlabProject: v.pipe(text, v.includes("/", "chemin GitLab attendu : groupe/projet")),
  baseBranch: text,
  layer: v.picklist(["front", "backend", "data", "eval"]),
  packageManager: v.picklist(["npm", "pnpm", "yarn", "bun"]),
  monorepoTool: v.nullable(v.picklist(["turbo", "lerna"])),
  packageName: v.nullable(text),
  dependsOn: v.array(text),
  commands: v.object({ lint: command, typecheck: command, ut: command, it: command, ft: command, ct: command, e2e: command }),
  withoutTests: v.optional(v.boolean(), false),
  localFiles: v.optional(v.array(insideRepo), []),
  reports: v.optional(perKind(text), {}),
  targeting: v.optional(perKind(v.nullable(text)), {}),
  containers: v.optional(v.object({ required: v.boolean(), images: v.array(text) }), { required: false, images: [] }),
  bump: v.optional(v.nullable(text), null),
  release: v.optional(v.object({ manifest: v.optional(insideRepo, "package.json"), tagPrefix: v.optional(v.string(), "v") }), {
    manifest: "package.json",
    tagPrefix: "v",
  }),
  ciJobsToWatch: v.array(text),
  description: text,
  keywords: v.array(text),
});

export const RegistrySchema = v.object({
  schemaVersion: v.literal(1),
  repositories: v.array(RepoSchema),
  evalOnly: v.optional(v.object({ repos: v.array(text), jiraProjects: v.array(text) }), { repos: [], jiraProjects: [] }),
});

const AgentModelSchema = v.object({
  model: text,
  reasoning: v.optional(v.picklist(["low", "medium", "high", "xhigh", "max"])),
});

export const SettingsSchema = v.object({
  schemaVersion: v.literal(1),
  budgets: v.object({
    testAdversary: positive,
    redChecker: positive,
    testDispute: positive,
    greenChecker: positive,
    codeAdversary: positive,
    disputeBeforeEscalation: positive,
    developerBatchLines: positive,
    grillRounds: positive,
    planRepairs: positive,
    memoryRepairs: positive,
    proseRepairs: positive,
  }),
  timeouts: v.object({
    ciPipelineSeconds: positive,
    repoSetupSeconds: positive,
    commandSeconds: positive,
    commandSilenceSeconds: positive,
    containerStartSeconds: positive,
    imagePullSeconds: positive,
    agentSeconds: positive,
    agentIdleSeconds: positive,
  }),
  memory: v.object({
    maxNoteLines: positive,
    selection: v.object({ maxNotes: positive, maxLines: positive }),
  }),
  naming: v.object({
    types: v.array(text),
    branch: text,
    mergeRequest: text,
    slackChannel: text,
    devVersionSuffix: text,
    slugMaxLength: positive,
    typeFromJiraIssueType: v.record(v.string(), text),
  }),
  git: v.optional(v.object({ committer: v.optional(v.object({ name: text, email: text })) }), {}),
  gitlab: v.object({ mrDraft: v.boolean() }),
  jira: v.object({ transitions: squadIndexed(v.object({ afterMergeRequest: text })) }),
  slack: v.object({
    channelVisibility: v.picklist(["private", "public"]),
    invitees: squadIndexed(v.array(v.pipe(v.string(), v.email()))),
  }),
  agents: v.object({
    default: AgentModelSchema,
    byRole: v.optional(v.record(v.picklist(ROLE_NAMES), AgentModelSchema), {}),
  }),
  sandbox: v.object({
    image: text,
    cpus: v.optional(v.pipe(v.number(), v.minValue(0.5))),
    memoryMb: v.optional(positive),
    agentChecks: v.optional(v.boolean(), false),
  }),
  scope: v.object({ concurrency: positive }),
});

export type RepoEntry = v.InferOutput<typeof RepoSchema>;
export type Registry = v.InferOutput<typeof RegistrySchema>;
export type Settings = v.InferOutput<typeof SettingsSchema>;
export type AgentModel = v.InferOutput<typeof AgentModelSchema>;
export type SquadIndexed<T> = { readonly default: T; readonly bySquad: Readonly<Record<string, T>> };

export function registryProblems(registry: Registry): string[] {
  const problems: string[] = [];
  const byName = new Map(registry.repositories.map((repo) => [repo.name, repo]));
  if (byName.size !== registry.repositories.length) problems.push("deux repos portent le meme nom");
  for (const repo of registry.repositories) {
    for (const upstream of repo.dependsOn) {
      const target = byName.get(upstream);
      if (!target) problems.push(`${repo.name} dependsOn ${upstream}, qui n'est pas declare`);
      else if (target.level >= repo.level) {
        problems.push(`${repo.name} (level ${repo.level}) dependsOn ${upstream} (level ${target.level}) : l'amont doit avoir un level inferieur`);
      }
    }
    const hasTests = TEST_KINDS.some((kind) => repo.commands[kind] !== null);
    if (hasTests === repo.withoutTests) {
      problems.push(hasTests ? `${repo.name} declare withoutTests mais a des commandes de test` : `${repo.name} n'a aucune commande de test sans declarer withoutTests`);
    }
  }
  return problems;
}

export function findRepo(registry: Registry, name: string): RepoEntry | undefined {
  return registry.repositories.find((repo) => repo.name === name);
}

export function orderByLevel<T extends Pick<RepoEntry, "level" | "name">>(repos: readonly T[]): T[] {
  return [...repos].sort((a, b) => a.level - b.level || a.name.localeCompare(b.name));
}

export function resolveBySquad<T>(indexed: SquadIndexed<T>, squad: string): T {
  const wanted = squad.trim().toLowerCase();
  const match = Object.entries(indexed.bySquad).find(([key]) => key.trim().toLowerCase() === wanted);
  return match ? match[1] : indexed.default;
}

export function isRepoEligible(registry: Registry, repo: RepoEntry, squad: string): boolean {
  const isEvalTicket = registry.evalOnly.jiraProjects.some((project) => project.toUpperCase() === squad.toUpperCase());
  return isEvalTicket === registry.evalOnly.repos.includes(repo.name);
}

export function eligibleRepos(registry: Registry, squad: string): RepoEntry[] {
  return orderByLevel(registry.repositories.filter((repo) => isRepoEligible(registry, repo, squad)));
}

export function commandFor(repo: RepoEntry, kind: CommandKind): string | null {
  return repo.commands[kind];
}

export function declaredTestKinds(repo: RepoEntry): TestKind[] {
  return TEST_KINDS.filter((kind) => repo.commands[kind] !== null);
}

export function targetingFor(repo: RepoEntry, kind: CommandKind): string | null {
  return kind in repo.targeting ? (repo.targeting[kind] ?? null) : "{paths}";
}

export function reportPathFor(repo: RepoEntry, kind: CommandKind): string | null {
  return repo.reports[kind] ?? null;
}

export function downstreamInScope(registry: Registry, upstream: string, scope: readonly string[]): RepoEntry[] {
  return registry.repositories.filter((repo) => scope.includes(repo.name) && repo.dependsOn.includes(upstream));
}
