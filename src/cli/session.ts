import type { WorkflowAnswer } from "@elie-laloum/outpost";
import type { AppContext } from "../app/context.ts";
import { type DriveOutcome, type DriveRequest, drive } from "../app/driver.ts";
import { openJournal } from "../app/event-journal.ts";
import { readLedger } from "../app/ledger.ts";
import { acquireLock } from "../app/lock.ts";
import { pullMemory } from "../app/memory-repository.ts";
import { seedJournal } from "../app/run-history.ts";
import { releaseCheckpoint, storageFor } from "../app/storage.ts";
import type { RunObserver } from "../domain/run-events.ts";
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
  // Everything the run does also goes to its journal, for show and for the next resume.
  const journal = openJournal(app.paths, key);
  const events: RunObserver = (event) => {
    journal.record(event);
    session.progress.event(event);
  };
  const ended = (outcome: DriveOutcome): DriveOutcome => {
    journal.end(outcome);
    return outcome;
  };
  try {
    const ledger = readLedger(app.paths, key);
    // The journal only feeds the screen: a run never fails on it.
    if (ledger) await seedJournal(app.paths, ledger).catch(() => {});
    journal.begin(process.pid);
    const pulled = await pullMemory(app.memoryRepository, app.configuration.settings.git.committer);
    if (pulled) events({ type: "warning", task: null, text: pulled });
    const orphan = lock.reclaimed ? ledger?.active : null;
    if (orphan) await releaseCheckpoint(storageFor(app.paths, key), orphan.runId);
    let request: DriveRequest = first;
    while (true) {
      const outcome = await drive(app, key, request, { ...(session.signal ? { signal: session.signal } : {}), events });
      session.progress.pause();
      if (outcome.status !== "waiting") return ended(outcome);
      const pending = outcome.requests[0];
      if (!pending) return ended(outcome);
      events({ type: "question", request: pending });
      const value = await session.prompter.ask(pending);
      if (value === null) return ended({ status: "cancelled" });
      const answer: WorkflowAnswer = { executionId: pending.executionId, key: pending.key, requestId: pending.id, actor: HUMAN, value };
      request = { answers: [answer] };
    }
  } finally {
    journal.close();
    lock.release();
  }
}
