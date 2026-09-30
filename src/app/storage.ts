import { createHash } from "node:crypto";
import {
  createLocalTransport,
  createTaskCacheStore,
  createWorkflowCheckpointStore,
  recoverWorkflowCheckpoint,
  type TaskCacheStore,
  type Transport,
  type WorkflowCheckpoint,
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

const CHECKPOINT_BYTES = 16 * 1024 * 1024 + 1024;

function checkpointPath(runId: string): string {
  return `checkpoints/${createHash("sha256").update(runId).digest("hex")}.json`;
}

/** Reads a finished run's checkpoint without taking its lease: for display only. */
export async function readCheckpoint(storage: RunStorage, runId: string): Promise<WorkflowCheckpoint | null> {
  const saved = await storage.transporter.read(checkpointPath(runId), { maxBytes: CHECKPOINT_BYTES });
  if (!saved) return null;
  const envelope = JSON.parse(Buffer.from(saved.bytes).toString("utf8")) as { readonly checkpoint?: WorkflowCheckpoint };
  return envelope.checkpoint ?? null;
}

export async function releaseCheckpoint(storage: RunStorage, runId: string): Promise<boolean> {
  const saved = await storage.transporter.read(checkpointPath(runId));
  if (!saved) return false;
  await recoverWorkflowCheckpoint({ transporter: storage.transporter, runId, revision: saved.revision });
  return true;
}
