import type { AgentObservation, TaskStatus, WorkflowEvent } from "@elie-laloum/outpost";
import type { RoleName } from "./roles.ts";

export type RunPhase = "framing" | "delivery" | "closing";

export interface Tokens {
  readonly input: number;
  readonly cached: number;
  readonly output: number;
}

export const NO_TOKENS: Tokens = { input: 0, cached: 0, output: 0 };

export function addTokens(left: Tokens, right: Tokens): Tokens {
  return { input: left.input + right.input, cached: left.cached + right.cached, output: left.output + right.output };
}

/** The task an agent works for; `lane` separates agents running side by side inside one task. */
export interface AgentSource {
  readonly task: string;
  readonly lane?: string;
}

/** A task as its phase starts, restored from the checkpoint. */
export interface PhaseTask {
  readonly key: string;
  readonly status: TaskStatus;
  readonly attempts: number;
  readonly startedAt: string | null;
  readonly finishedAt: string | null;
  readonly cached: boolean;
}

export type PublicationAction = "tag" | "pipeline" | "push" | "merge-request" | "slack" | "jira";

export type RunEvent =
  | {
      readonly type: "phase";
      readonly phase: RunPhase;
      readonly tasks: readonly PhaseTask[];
      readonly repos: readonly string[];
      /** Tokens this run of the phase already spent, restored from its checkpoint. */
      readonly usage: Tokens;
      /** Tokens every earlier workflow run of the ticket spent. */
      readonly earlier: Tokens;
    }
  | { readonly type: "workflow"; readonly event: WorkflowEvent }
  | { readonly type: "agent"; readonly source: AgentSource; readonly role: RoleName; readonly event: AgentObservation }
  | {
      readonly type: "gate";
      readonly task: string;
      readonly gate: string;
      readonly round: number;
      readonly verdict: "pass" | "feedback";
      readonly spent: number;
      readonly budget: number;
      readonly text: string | null;
    }
  | {
      readonly type: "command";
      readonly task: string;
      readonly label: string;
      readonly command: string;
      readonly status: "start" | "progress" | "end";
      readonly elapsedMs: number;
      readonly exitCode?: number;
      readonly passed?: boolean;
      readonly logPath?: string | null;
    }
  | { readonly type: "publication"; readonly task: string; readonly action: PublicationAction; readonly detail: string; readonly url: string | null };

export type RunObserver = (event: RunEvent) => void;
