import type { Logging, TaskCacheOptions, TaskCacheStore, TaskContext, WorkflowJson } from "@elie-laloum/outpost";
import type { AgentSession } from "../agents/role.ts";
import type { AppContext } from "../app/context.ts";
import type { Ledger } from "../app/ledger.ts";
import { promptDigest } from "../app/version.ts";
import type { RoleName } from "../domain/roles.ts";
import type { AgentSource, RunEvent, RunObserver } from "../domain/run-events.ts";
import type { CommandObserver } from "../ports/checks.ts";
import type { ReaderSandbox } from "../ports/sandboxes.ts";

export const HUMAN = "humain";

export interface RunContext {
  readonly app: AppContext;
  readonly ledger: Ledger;
  readonly cache: TaskCacheStore;
  readonly logging?: Logging;
  readonly events?: RunObserver;
  readonly signal?: AbortSignal;
}

export function session(run: RunContext, sandbox: AgentSession["sandbox"], source: AgentSource): AgentSession {
  return {
    sandbox,
    agents: run.app.services.agents,
    source,
    ...(run.logging !== undefined ? { logging: run.logging } : {}),
    ...(run.events ? { events: run.events } : {}),
  };
}

export async function withReader<T>(run: RunContext, label: string, source: AgentSource, work: (session: AgentSession, reader: ReaderSandbox) => Promise<T>, copies?: readonly string[]): Promise<T> {
  const reader = await run.app.services.sandboxes.openReader({ label, ...(copies ? { copies } : {}), ...(run.signal ? { signal: run.signal } : {}) });
  try {
    return await work(session(run, reader.sandbox, source), reader);
  } finally {
    await reader.close();
  }
}

export function cached(run: RunContext, roles: readonly RoleName[], key: (context: TaskContext) => WorkflowJson): TaskCacheOptions {
  return { store: run.cache, version: promptDigest(roles), key };
}

export function emit(run: RunContext, event: RunEvent): void {
  run.events?.(event);
}

/** Reports one registry command of `task` as `command` events; absent when nobody listens. */
export function commandObserver(run: RunContext, task: string, label: string): CommandObserver | undefined {
  const events = run.events;
  if (!events) return undefined;
  let command = "";
  return {
    start(full) {
      command = full;
      events({ type: "command", task, label, command, status: "start", elapsedMs: 0 });
    },
    progress(elapsedMs) {
      events({ type: "command", task, label, command, status: "progress", elapsedMs });
    },
    end(outcome) {
      events({ type: "command", task, label, command, status: "end", ...outcome });
    },
  };
}
