import * as clack from "@clack/prompts";
import type { AgentObservation, WorkflowEvent } from "@elie-laloum/outpost";
import type { RoleName } from "../domain/roles.ts";
import type { RunEvent } from "../domain/run-events.ts";
import { labelOf } from "./labels.ts";

export interface Progress {
  event(event: RunEvent): void;
  pause(): void;
}

export const silentProgress: Progress = { event: () => {}, pause: () => {} };

export function clackProgress(): Progress {
  const spinner = clack.spinner();
  let active: string | null = null;
  const stop = (message?: string) => {
    if (active) spinner.stop(message ?? labelOf(active));
    active = null;
  };
  const workflow = (event: WorkflowEvent) => {
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
  };
  const agent = (role: RoleName, event: AgentObservation) => {
    if (active && event.kind === "tool") spinner.message(`${labelOf(active)} — ${role}`);
  };
  return {
    event(event) {
      if (event.type === "workflow") workflow(event.event);
      if (event.type === "agent") agent(event.role, event.event);
      if (event.type === "warning") clack.log.warn(event.text);
    },
    pause: () => stop(),
  };
}
