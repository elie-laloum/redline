import { createAgent, createClaudeHarness, type DispatchAgent } from "@elie-laloum/outpost";
import type { Settings } from "../domain/config.ts";
import type { RoleName } from "../domain/roles.ts";
import type { AgentFactory } from "../ports/agents.ts";

const JUDGES_IN_WORKTREE: readonly RoleName[] = ["test-adversary", "red-checker", "code-adversary"];

export function createClaudeAgents(settings: Settings): AgentFactory {
  const cache = new Map<RoleName, DispatchAgent>();
  return {
    agent(role) {
      const existing = cache.get(role);
      if (existing) return existing;
      const model = settings.agents.byRole[role] ?? settings.agents.default;
      const harness = createClaudeHarness({ authentication: "account", ...(JUDGES_IN_WORKTREE.includes(role) ? { permissions: "default" as const } : {}) });
      const agent = createAgent({ harness, model: { name: model.model, ...(model.reasoning ? { reasoning: model.reasoning } : {}) } });
      cache.set(role, agent);
      return agent;
    },
    limits: () => ({ deadlineMs: settings.timeouts.agentSeconds * 1000, idleMs: settings.timeouts.agentIdleSeconds * 1000 }),
  };
}
