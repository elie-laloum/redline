import { existsSync, readFileSync } from "node:fs";
import { createMemoryStore } from "../adapters/memory-store.ts";
import { loadSecrets, parseEnvFile, SECRET_KEYS, type SecretKey, type Secrets } from "../adapters/secrets.ts";
import type { Registry, Settings } from "../domain/config.ts";
import { describeError } from "../domain/failure.ts";
import { type MemoryRepository, memoryRepository } from "./memory-repository.ts";
import type { Paths } from "./paths.ts";
import { listRuns } from "./runs.ts";
import { defaultSettings, loadRegistry, loadSettings, personalSettings } from "./settings.ts";

/** Everything init shows, read even when a file is invalid: the error then stays in its section. */
export interface SetupSnapshot {
  readonly paths: Paths;
  /** The values written in the .env, before any shell variable. */
  readonly env: ReadonlyMap<string, string>;
  /** The keys a variable exported in the shell overrides. */
  readonly shell: ReadonlySet<SecretKey>;
  readonly secrets: Secrets;
  readonly settings: Settings | null;
  readonly settingsError: string | null;
  readonly defaults: Readonly<Record<string, unknown>>;
  readonly overrides: Readonly<Record<string, unknown>>;
  readonly registry: Registry | null;
  readonly registryError: string | null;
  readonly hasRegistry: boolean;
  readonly voice: boolean;
  readonly memory: MemoryRepository | null;
  readonly notes: number;
  /** The tickets a live process is running: the memory must not move under them. */
  readonly running: readonly string[];
}

export function readSetup(paths: Paths, environment: Readonly<Record<string, string | undefined>> = process.env): SetupSnapshot {
  const env = existsSync(paths.env) ? parseEnvFile(readFileSync(paths.env, "utf8")) : new Map<string, string>();
  const shell = new Set(SECRET_KEYS.filter((key) => Boolean(environment[key])));
  const settings = attempt(() => loadSettings(paths));
  const registry = attempt(() => loadRegistry(paths));
  const memory = settings.value ? memoryRepository(settings.value, paths.home) : null;
  const notes = memory ? (attempt(() => createMemoryStore(memory.directory, Number.MAX_SAFE_INTEGER).list().length).value ?? 0) : 0;
  return {
    paths,
    env,
    shell,
    secrets: loadSecrets(paths.env, environment),
    settings: settings.value,
    settingsError: settings.error,
    defaults: defaultSettings(),
    overrides: attempt(() => personalSettings(paths)).value ?? {},
    registry: registry.value,
    registryError: registry.error,
    hasRegistry: existsSync(paths.registry),
    voice: existsSync(paths.voice),
    memory,
    notes,
    running: listRuns(paths).flatMap((run) => (run.running === null ? [] : [run.key])),
  };
}

function attempt<T>(read: () => T): { readonly value: T | null; readonly error: string | null } {
  try {
    return { value: read(), error: null };
  } catch (error) {
    return { value: null, error: describeError(error) };
  }
}
