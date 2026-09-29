import { createCheckRunner } from "../adapters/checks.ts";
import { createFigma } from "../adapters/figma.ts";
import { createGitlab } from "../adapters/gitlab.ts";
import { createJira } from "../adapters/jira.ts";
import { createMemoryStore, type MemoryStore } from "../adapters/memory-store.ts";
import { loadSecrets, type Secrets } from "../adapters/secrets.ts";
import { createSlack } from "../adapters/slack.ts";
import type { Chat } from "../ports/chat.ts";
import type { CheckRunner } from "../ports/checks.ts";
import type { Design } from "../ports/design.ts";
import type { Forge } from "../ports/forge.ts";
import type { Tracker } from "../ports/tracker.ts";
import { homeDirectory, logDirectory, type Paths, pathsOf } from "./paths.ts";
import { type Configuration, loadConfiguration } from "./settings.ts";

export interface Services {
  readonly tracker: Tracker;
  readonly forge: Forge;
  readonly chat: Chat;
  readonly design: Design;
}

export interface AppContext {
  readonly paths: Paths;
  readonly configuration: Configuration;
  readonly secrets: Secrets;
  readonly services: Services;
  memory(): MemoryStore;
  checks(key: string): CheckRunner;
}

export interface ContextOptions {
  readonly home?: string;
  readonly env?: Readonly<Record<string, string | undefined>>;
  readonly templates?: string;
  readonly services?: Partial<Services>;
}

export function createContext(options: ContextOptions = {}): AppContext {
  const env = options.env ?? process.env;
  const paths = pathsOf(options.home ?? homeDirectory(env));
  const configuration = loadConfiguration(paths, options.templates);
  const secrets = loadSecrets(paths.env, env);
  const { settings } = configuration;
  const services = lazyServices(secrets, options.services ?? {});

  return {
    paths,
    configuration,
    secrets,
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

function lazyServices(secrets: Secrets, overrides: Partial<Services>): Services {
  const cache: Partial<Services> = { ...overrides };
  const build: { [K in keyof Services]: () => Services[K] } = {
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
  };
}
