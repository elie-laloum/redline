import { createHash } from "node:crypto";
import type { TaskCacheStore, TaskContext, WorkflowJson } from "@elie-laloum/outpost";

export interface MemoOptions {
  readonly store: TaskCacheStore;
  readonly version: string;
  readonly key: (context: TaskContext) => WorkflowJson;
}

export interface Memo {
  recall(context: TaskContext): Promise<WorkflowJson | undefined>;
  remember(context: TaskContext, value: WorkflowJson): Promise<void>;
}

export function createMemo(workflow: string, task: string, options: MemoOptions): Memo {
  const fingerprint = (context: TaskContext) =>
    createHash("sha256").update(JSON.stringify({ memo: 1, workflow, task, version: options.version, key: options.key(context) })).digest("hex");
  return {
    async recall(context) {
      const entry = await options.store.read(fingerprint(context), { signal: context.signal });
      return entry?.value.kind === "json" ? entry.value.value : undefined;
    },
    async remember(context, value) {
      await options.store.write(
        { format: 1, fingerprint: fingerprint(context), workflow, task, version: options.version, createdAt: new Date().toISOString(), value: { kind: "json", value } },
        { signal: context.signal },
      );
    },
  };
}
