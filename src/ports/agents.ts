import type { DispatchAgent } from "@elie-laloum/outpost";
import type { RoleName } from "../domain/roles.ts";

export interface AgentLimits {
  readonly deadlineMs: number;
  readonly idleMs: number;
}

export interface AgentFactory {
  agent(role: RoleName): DispatchAgent;
  limits(role: RoleName): AgentLimits;
}
