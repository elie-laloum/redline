import * as clack from "@clack/prompts";
import type { AgentObservation, WorkflowEvent } from "@elie-laloum/outpost";
import type { RoleName } from "../domain/roles.ts";
import { labelOf } from "./labels.ts";

export interface Progress {
  workflow(event: WorkflowEvent): void;
  agent(role: RoleName, event: AgentObservation): void;
  pause(): void;
}

export const silentProgress: Progress = { workflow: () => {}, agent: () => {}, pause: () => {} };

export function clackProgress(): Progress {
  const spinner = clack.spinner();
  let active: string | null = null;
  const stop = (message?: string) => {
    if (active) spinner.stop(message ?? labelOf(active));
    active = null;
  };
  return {
    workflow(event) {
      if (!event.key) return;
      if (event.type === "cache" && event.cache === "hit") clack.log.info(`${labelOf(event.key)} — deja fait`);
      if (event.type === "task" && event.status === "active") {
        stop();
        active = event.key;
        spinner.start(labelOf(event.key));
      }
      if (event.type === "loop" && event.key === active) spinner.message(`${labelOf(event.key)} — tour ${event.round} (${event.phase === "check" ? "verification" : "production"})`);
      if (event.type === "task" && event.key === active && event.status && event.status !== "active") {
        stop(`${event.status === "done" ? "✓" : event.status === "failed" ? "✗" : "·"} ${labelOf(event.key)}`);
      }
    },
    agent(role, event) {
      if (active && event.kind === "tool") spinner.message(`${labelOf(active)} — ${role}`);
    },
    pause: () => stop(),
  };
}
