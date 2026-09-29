import type { WorkflowAnswer } from "@elie-laloum/outpost";
import type { AppContext } from "../app/context.ts";
import { type DriveOutcome, type DriveRequest, drive } from "../app/driver.ts";
import { readLedger } from "../app/ledger.ts";
import { acquireLock } from "../app/lock.ts";
import { releaseCheckpoint, storageFor } from "../app/storage.ts";
import { HUMAN } from "../phases/run.ts";
import type { Prompter } from "./ask.ts";
import type { Progress } from "./progress.ts";

export interface Session {
  readonly prompter: Prompter;
  readonly progress: Progress;
  readonly signal?: AbortSignal;
}

export async function runSession(app: AppContext, key: string, first: DriveRequest, session: Session): Promise<DriveOutcome> {
  const lock = acquireLock(app.paths, key, `${key}-${process.pid}`);
  try {
    const orphan = lock.reclaimed ? readLedger(app.paths, key)?.active : null;
    if (orphan) await releaseCheckpoint(storageFor(app.paths, key), orphan.runId);
    let request: DriveRequest = first;
    while (true) {
      const outcome = await drive(app, key, request, {
        ...(session.signal ? { signal: session.signal } : {}),
        observe: session.progress.workflow,
        agentObserve: session.progress.agent,
      });
      session.progress.pause();
      if (outcome.status !== "waiting") return outcome;
      const pending = outcome.requests[0];
      if (!pending) return outcome;
      const value = await session.prompter.ask(pending);
      if (value === null) return { status: "cancelled" };
      const answer: WorkflowAnswer = { executionId: pending.executionId, key: pending.key, requestId: pending.id, actor: HUMAN, value };
      request = { answers: [answer] };
    }
  } finally {
    lock.release();
  }
}
