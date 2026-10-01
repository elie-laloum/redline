import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { type AgentAuthentication, createAgent, createClaudeHarness, type DispatchAgent } from "@elie-laloum/outpost";
import type { AuthMode, Settings } from "../domain/config.ts";
import { fail } from "../domain/failure.ts";
import type { RoleName } from "../domain/roles.ts";
import type { AgentFactory } from "../ports/agents.ts";
import type { SecretKey, Secrets } from "./secrets.ts";

const JUDGES_IN_WORKTREE: readonly RoleName[] = ["test-adversary", "red-checker", "code-adversary"];

/** The secret each mode reads from the .env; the account mode reads the host's login file instead. */
export const AUTH_SECRETS: Readonly<Record<AuthMode, SecretKey | null>> = { account: null, oauth: "CLAUDE_CODE_OAUTH_TOKEN", key: "ANTHROPIC_API_KEY" };

export const AUTH_LABELS: Readonly<Record<AuthMode, string>> = {
  account: "compte Claude de la machine (~/.claude/.credentials.json)",
  oauth: "jeton de compte Claude (claude setup-token)",
  key: "cle d'API Anthropic, facturee a l'usage",
};

export function credentialsFile(env: Readonly<Record<string, string | undefined>> = process.env): string {
  return join(env.CLAUDE_CONFIG_DIR ?? join(homedir(), ".claude"), ".credentials.json");
}

/** What the mode lacks to authenticate the agents, or null when it has it. */
export function authenticationProblem(mode: AuthMode, secrets: Pick<Secrets, "get">, env: Readonly<Record<string, string | undefined>> = process.env): string | null {
  const secret = AUTH_SECRETS[mode];
  if (secret) return secrets.get(secret) ? null : `${secret} manquant : bun redline init, section Claude`;
  const file = credentialsFile(env);
  return existsSync(file) ? null : `${file} absent : connecte-toi avec claude, ou passe en oauth avec bun redline init, section Claude`;
}

export function authenticationFor(mode: AuthMode, secrets: Pick<Secrets, "get">): AgentAuthentication {
  const secret = AUTH_SECRETS[mode];
  if (!secret) return "account";
  const value = secrets.get(secret) ?? fail(`Authentification ${mode} : ${secret} manquant.`, "Renseigne-le avec : bun redline init, section Claude");
  return mode === "oauth" ? { account: { key: value } } : { usage: { key: value } };
}

export function createClaudeAgents(settings: Settings, authentication: AgentAuthentication = "account"): AgentFactory {
  const cache = new Map<RoleName, DispatchAgent>();
  return {
    agent(role) {
      const existing = cache.get(role);
      if (existing) return existing;
      const model = settings.agents.byRole[role] ?? settings.agents.default;
      const harness = createClaudeHarness({ authentication, ...(JUDGES_IN_WORKTREE.includes(role) ? { permissions: "default" as const } : {}) });
      const agent = createAgent({ harness, model: { name: model.model, ...(model.reasoning ? { reasoning: model.reasoning } : {}) } });
      cache.set(role, agent);
      return agent;
    },
    limits: () => ({ deadlineMs: settings.timeouts.agentSeconds * 1000, idleMs: settings.timeouts.agentIdleSeconds * 1000 }),
  };
}
