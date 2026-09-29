import type { AgentObservation, Logging, TaskCacheOptions, TaskCacheStore, TaskContext, WorkflowJson } from "@elie-laloum/outpost";
import type { AgentSession } from "../agents/role.ts";
import type { AppContext } from "../app/context.ts";
import type { Ledger } from "../app/ledger.ts";
import { promptDigest } from "../app/version.ts";
import type { RoleName } from "../domain/roles.ts";
import type { ReaderSandbox } from "../ports/sandboxes.ts";

export const HUMAN = "humain";

export interface RunContext {
  readonly app: AppContext;
  readonly ledger: Ledger;
  readonly cache: TaskCacheStore;
  readonly logging?: Logging;
  readonly observe?: (role: RoleName, event: AgentObservation) => void;
  readonly signal?: AbortSignal;
}

export function session(run: RunContext, sandbox: AgentSession["sandbox"]): AgentSession {
  return {
    sandbox,
    agents: run.app.services.agents,
    ...(run.logging !== undefined ? { logging: run.logging } : {}),
    ...(run.observe ? { observe: run.observe } : {}),
  };
}

export async function withReader<T>(run: RunContext, label: string, work: (session: AgentSession, reader: ReaderSandbox) => Promise<T>, copies?: readonly string[]): Promise<T> {
  const reader = await run.app.services.sandboxes.openReader({ label, ...(copies ? { copies } : {}), ...(run.signal ? { signal: run.signal } : {}) });
  try {
    return await work(session(run, reader.sandbox), reader);
  } finally {
    await reader.close();
  }
}

export function cached(run: RunContext, roles: readonly RoleName[], key: (context: TaskContext) => WorkflowJson): TaskCacheOptions {
  return { store: run.cache, version: promptDigest(roles), key };
}
