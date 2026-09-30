import { createHash } from "node:crypto";
import {
  createLocalTransport,
  createTaskCacheStore,
  createWorkflowCheckpointStore,
  recoverWorkflowCheckpoint,
  type TaskCacheStore,
  type Transport,
  type WorkflowCheckpointStore,
} from "@elie-laloum/outpost";
import { type Paths, runDirectory } from "./paths.ts";

export interface RunStorage {
  readonly transporter: Transport;
  readonly checkpoints: WorkflowCheckpointStore;
  readonly cache: TaskCacheStore;
}

export function storageFor(paths: Paths, key: string): RunStorage {
  const transporter = createLocalTransport({ directory: runDirectory(paths, key) });
  return { transporter, checkpoints: createWorkflowCheckpointStore({ transporter }), cache: createTaskCacheStore({ transporter }) };
}

export async function releaseCheckpoint(storage: RunStorage, runId: string): Promise<boolean> {
  const saved = await storage.transporter.read(`checkpoints/${createHash("sha256").update(runId).digest("hex")}.json`);
  if (!saved) return false;
  await recoverWorkflowCheckpoint({ transporter: storage.transporter, runId, revision: saved.revision });
  return true;
}
