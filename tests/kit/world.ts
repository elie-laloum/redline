import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { WorkflowInputRequest, WorkflowResult } from "@elie-laloum/outpost";
import { createOutpostSandboxes } from "../../src/adapters/outpost-sandboxes.ts";
import { type AppContext, createContext } from "../../src/app/context.ts";
import { ensureHome } from "../../src/app/home.ts";
import { type Ledger, newLedger, writeLedger } from "../../src/app/ledger.ts";
import { expandTilde, pathsOf } from "../../src/app/paths.ts";
import { type RunStorage, storageFor } from "../../src/app/storage.ts";
import type { RunContext } from "../../src/phases/run.ts";
import { type FixtureRepo, materialize } from "../fixtures/repos.ts";
import { type FakeGitLab, type FakeJira, type FakeSlack, fakeGitLab, fakeJira, fakeSlack } from "../fixtures/servers.ts";
import { TEMPLATES, temporaryDirectory } from "../helpers.ts";
import { type FakeAgents, fakeAgents, type Script } from "./agents.ts";

export interface World {
  readonly root: string;
  readonly repos: readonly FixtureRepo[];
  readonly jira: FakeJira;
  readonly slack: FakeSlack;
  readonly gitlab: FakeGitLab;
  readonly agents: FakeAgents;
  readonly app: AppContext;
  readonly storage: (key: string) => RunStorage;
  ledger(key: string, overrides?: Partial<Ledger>): Ledger;
  run(ledger: Ledger): RunContext;
  cleanup(): Promise<void>;
}

export interface WorldOptions {
  readonly script: Script;
  readonly issues?: Parameters<typeof fakeJira>[0];
  readonly settings?: (template: string) => string;
}

const KEYWORDS: Record<string, string> = {
  "fixture-core": "[periode, period]",
  "fixture-app": "[liste, list]",
  "fixture-mono": "[monorepo]",
  "fixture-flaky": "[flaky, answer]",
};

export function registryFor(repos: readonly FixtureRepo[]): string {
  const entries = repos.map((repo) => {
    const tested = repo.name !== "fixture-mono";
    return [
      `  - name: ${repo.name}`,
      `    level: ${repo.level}`,
      `    path: ${repo.path}`,
      `    gitlabProject: fixtures/${repo.name}`,
      `    baseBranch: ${repo.baseBranch}`,
      `    layer: backend`,
      `    packageManager: npm`,
      `    monorepoTool: ${repo.monorepoTool ?? "null"}`,
      `    packageName: ${repo.packageName ? `"${repo.packageName}"` : "null"}`,
      `    dependsOn: [${repo.dependsOn.join(", ")}]`,
      `    commands: { lint: null, typecheck: null, ut: ${tested ? '"npm run test:unit"' : "null"}, it: null, ft: null, ct: null, e2e: null }`,
      ...(tested ? [] : ["    withoutTests: true"]),
      ...(repo.name === "fixture-app" ? ['    bump: "node scripts/bump.mjs {package} {version}"'] : []),
      `    ciJobsToWatch: [build]`,
      `    description: Depot de fixture ${repo.name}.`,
      `    keywords: ${KEYWORDS[repo.name] ?? "[]"}`,
    ].join("\n");
  });
  return `schemaVersion: 1\nrepositories:\n${entries.join("\n")}\n`;
}

export async function createWorld(options: WorldOptions): Promise<World> {
  const directory = temporaryDirectory("redline-world-");
  const repos = materialize(join(directory.path, "fixtures"));
  const home = join(directory.path, "home");
  const paths = pathsOf(home);
  mkdirSync(home, { recursive: true });
  writeFileSync(paths.registry, registryFor(repos));
  const template = await Bun.file(join(TEMPLATES, "redline.example.yaml")).text();
  writeFileSync(paths.settings, options.settings ? options.settings(template) : template);
  await ensureHome(paths);

  const [jira, slack, gitlab] = await Promise.all([fakeJira(options.issues ?? []), fakeSlack(), fakeGitLab()]);
  const agents = fakeAgents(options.script);
  const env = {
    JIRA_SITE_URL: jira.url,
    JIRA_EMAIL: "moi@test",
    JIRA_API_TOKEN: "jeton",
    GITLAB_HOST: gitlab.url,
    GITLAB_TOKEN: "jeton",
    SLACK_API_BASE: slack.url,
    SLACK_USER_TOKEN: "xoxp-test",
  };
  const bootstrap = createContext({ home, env });
  const sandboxes = createOutpostSandboxes({
    settings: bootstrap.configuration.settings,
    registry: bootstrap.configuration.registry,
    home,
    resolvePath: expandTilde,
    isolation: "local",
  });
  const app = createContext({ home, env, services: { agents, sandboxes } });

  return {
    root: directory.path,
    repos,
    jira,
    slack,
    gitlab,
    agents,
    app,
    storage: (key) => storageFor(paths, key),
    ledger(key, overrides = {}) {
      const snapshot = newLedger({ key, squad: key.split("-")[0] ?? key, title: jira.issues.get(key)?.summary ?? key, url: `${jira.url}/browse/${key}`, notes: null, figmaOverrides: [], budgets: app.configuration.settings.budgets });
      return writeLedger(paths, { ...snapshot, ...overrides });
    },
    run: (ledger) => ({ app, ledger, cache: storageFor(paths, ledger.key).cache, logging: false }),
    async cleanup() {
      await Promise.all([jira.close(), slack.close(), gitlab.close()]);
      directory.cleanup();
    },
  };
}

export type Answerer = (request: WorkflowInputRequest) => string;

export async function answering(start: (answers?: { executionId: string; key: string; requestId: string; actor: string; value: string }[]) => Promise<WorkflowResult>, answers: readonly (string | Answerer)[]): Promise<{ result: WorkflowResult; asked: string[] }> {
  const queue = [...answers];
  const asked: string[] = [];
  let result = await start();
  while (result.status === "waiting-input") {
    const request = result.inputRequests[0];
    const next = queue.shift();
    if (!request || next === undefined) break;
    asked.push(request.question);
    const value = typeof next === "function" ? next(request) : next;
    result = await start([{ executionId: request.executionId, key: request.key, requestId: request.id, actor: "humain", value }]);
  }
  return { result, asked };
}
