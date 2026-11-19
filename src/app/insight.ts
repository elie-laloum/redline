import { defineTask, defineWorkflow } from "@elie-laloum/outpost/workflows";
import { ask } from "../agents/role.ts";
import { runExplainer } from "../agents/run-explainer.ts";
import { describeError, fail } from "../domain/failure.ts";
import { INSIGHT_LABELS, type Insight, insightBrief, type InsightRequest } from "../domain/insight.ts";
import type { AppContext } from "./context.ts";
import { readJournal } from "./event-journal.ts";
import { readLedger } from "./ledger.ts";

/**
 * Asks the run explainer one question about a run, from its journal: one agent call, in a reader
 * sandbox, outside any phase. Nothing is checkpointed or recorded in the ledger — the answer is for
 * the screen that asked.
 */
export async function explainRun(app: AppContext, key: string, request: InsightRequest, signal?: AbortSignal): Promise<Insight> {
  const ledger = readLedger(app.paths, key) ?? fail(`Aucun run pour ${key}.`);
  const brief = insightBrief(readJournal(app.paths, key) ?? [], request);
  const explain = defineTask<Insight>({
    key: "explain",
    async perform(context) {
      const reader = await app.services.sandboxes.openReader({ label: `${key}-explain`, ...(signal ? { signal } : {}) });
      try {
        const session = { sandbox: reader.sandbox, agents: app.services.agents, source: { task: "explain" } };
        return await ask(context, session, runExplainer, { key, title: ledger.title, question: INSIGHT_LABELS[request.question], task: request.task, brief });
      } finally {
        await reader.close();
      }
    },
  });
  const result = await defineWorkflow("redline.explain", [explain]).start(signal ? { signal } : {});
  if (result.status !== "done") fail(`L'explication n'a pas abouti : ${result.errors.map(describeError).join(" ; ") || result.status}.`);
  return result.value(explain);
}
