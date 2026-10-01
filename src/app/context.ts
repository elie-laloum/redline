import { createCheckRunner } from "../adapters/checks.ts";
import { authenticationFor, createClaudeAgents } from "../adapters/claude-agents.ts";
import { createFigma } from "../adapters/figma.ts";
import { createGitlab } from "../adapters/gitlab.ts";
import { createJira } from "../adapters/jira.ts";
import { createMemoryStore, type MemoryStore } from "../adapters/memory-store.ts";
import { createOutpostSandboxes } from "../adapters/outpost-sandboxes.ts";
import { loadSecrets, type Secrets } from "../adapters/secrets.ts";
import { createSlack } from "../adapters/slack.ts";
import type { AuthMode } from "../domain/config.ts";
import type { AgentFactory } from "../ports/agents.ts";
import type { Chat } from "../ports/chat.ts";
import type { CheckRunner } from "../ports/checks.ts";
import type { Design } from "../ports/design.ts";
import type { Forge } from "../ports/forge.ts";
import type { Sandboxes } from "../ports/sandboxes.ts";
import type { Tracker } from "../ports/tracker.ts";
import { type MemoryRepository, memoryRepository } from "./memory-repository.ts";
import { expandTilde, homeDirectory, logDirectory, type Paths, pathsOf } from "./paths.ts";
import { type Configuration, loadConfiguration } from "./settings.ts";

export interface Services {
  readonly tracker: Tracker;
  readonly forge: Forge;
  readonly chat: Chat;
  readonly design: Design;
  readonly agents: AgentFactory;
  readonly sandboxes: Sandboxes;
}

export interface AppContext {
  readonly paths: Paths;
  readonly configuration: Configuration;
  /** Where the memory's notes live: paths.memory is its directory. */
  readonly memoryRepository: MemoryRepository;
  readonly secrets: Secrets;
  /** The settings' mode, unless the command line overrides it for this run. */
  readonly authentication: AuthMode;
  readonly services: Services;
  memory(): MemoryStore;
  checks(key: string): CheckRunner;
}

export interface ContextOptions {
  readonly home?: string;
  readonly env?: Readonly<Record<string, string | undefined>>;
  readonly authentication?: AuthMode;
  readonly templates?: string;
  readonly services?: Partial<Services>;
}

export function createContext(options: ContextOptions = {}): AppContext {
  const env = options.env ?? process.env;
  const home = pathsOf(options.home ?? homeDirectory(env));
  const configuration = loadConfiguration(home, options.templates);
  const { settings } = configuration;
  const memory = memoryRepository(settings, home.home);
  const paths: Paths = { ...home, memory: memory.directory };
  const secrets = loadSecrets(paths.env, env);
  const authentication = options.authentication ?? settings.agents.authentication;
  const services = lazyServices(secrets, options.services ?? {}, {
    agents: () => createClaudeAgents(settings, authenticationFor(authentication, secrets)),
    sandboxes: () => createOutpostSandboxes({ settings, registry: configuration.registry, home: paths.home, memory, resolvePath: expandTilde, isolation: "docker" }),
  });

  return {
    paths,
    configuration,
    memoryRepository: memory,
    secrets,
    authentication,
    services,
    memory: () => createMemoryStore(paths.memory, settings.memory.maxNoteLines),
    checks: (key) =>
      createCheckRunner({
        commandSeconds: settings.timeouts.commandSeconds,
        silenceSeconds: settings.timeouts.commandSilenceSeconds,
        logDirectory: logDirectory(paths, key),
      }),
  };
}

function lazyServices(
  secrets: Secrets,
  overrides: Partial<Services>,
  runtime: { agents: () => AgentFactory; sandboxes: () => Sandboxes },
): Services {
  const cache: Partial<Services> = { ...overrides };
  const build: { [K in keyof Services]: () => Services[K] } = {
    ...runtime,
    tracker: () => createJira({ site: secrets.require("JIRA_SITE_URL"), email: secrets.require("JIRA_EMAIL"), token: secrets.require("JIRA_API_TOKEN") }),
    forge: () => createGitlab({ host: secrets.get("GITLAB_HOST") ?? "https://gitlab.com", token: secrets.require("GITLAB_TOKEN") }),
    chat: () => createSlack({ base: secrets.get("SLACK_API_BASE") ?? "https://slack.com/api", token: secrets.require("SLACK_USER_TOKEN") }),
    design: () => createFigma({ base: secrets.get("FIGMA_API_BASE") ?? "https://api.figma.com/v1", token: secrets.get("FIGMA_TOKEN") }),
  };
  const get = <K extends keyof Services>(key: K): Services[K] => {
    cache[key] ??= build[key]();
    return cache[key] as Services[K];
  };
  return {
    get tracker() {
      return get("tracker");
    },
    get forge() {
      return get("forge");
    },
    get chat() {
      return get("chat");
    },
    get design() {
      return get("design");
    },
    get agents() {
      return get("agents");
    },
    get sandboxes() {
      return get("sandboxes");
    },
  };
}
