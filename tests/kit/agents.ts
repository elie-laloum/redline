import { createAgent, createHarness, createHarnessEditTools, type DispatchAgent, type ModelProvider, type ModelRequest, type ModelResult } from "@elie-laloum/outpost";
import * as roles from "../../src/agents/index.ts";
import type { RoleName } from "../../src/domain/roles.ts";
import type { AgentFactory } from "../../src/ports/agents.ts";

export interface ScriptedTurn {
  readonly writes?: Readonly<Record<string, string>>;
  readonly reply: unknown | ((prompt: string) => unknown);
  readonly repairedReply?: unknown;
}

export type Script = Partial<Record<RoleName, ScriptedTurn[]>>;

export interface FakeAgents extends AgentFactory {
  readonly prompts: Partial<Record<RoleName, string[]>>;
  remaining(): Partial<Record<RoleName, number>>;
}

const TAGS = Object.fromEntries(Object.values(roles).map((role) => [role.name, role.tag])) as Record<RoleName, string>;
const usage = { input: 10, cached: 0, output: 10 };

export function fakeAgents(script: Script): FakeAgents {
  const queues = new Map(Object.entries(script).map(([role, turns]) => [role as RoleName, [...(turns ?? [])]]));
  const prompts: Partial<Record<RoleName, string[]>> = {};
  const agents = new Map<RoleName, DispatchAgent>();

  const provider = (role: RoleName): ModelProvider => {
    let current: { turn: ScriptedTurn; prompt: string; replies: number } | null = null;
    return {
      name: `fake-${role}`,
      async request(request: ModelRequest): Promise<ModelResult> {
        if ((request.messages?.length ?? 0) <= 1) {
          const turn = queues.get(role)?.shift();
          if (!turn) throw new Error(`unexpected dispatch: ${role}`);
          const prompt = firstText(request);
          (prompts[role] ??= []).push(prompt);
          current = { turn, prompt, replies: 0 };
          const writes = Object.entries(turn.writes ?? {});
          if (writes.length > 0) {
            return {
              text: "",
              content: writes.map(([path, content], index) => ({ type: "tool-call" as const, id: `w${index}`, name: "write_file", input: { path, content } })),
              stopReason: "tool-calls",
              usage,
            };
          }
        }
        if (!current) throw new Error(`no scripted turn for ${role}`);
        current.replies += 1;
        const source = current.replies > 1 && current.turn.repairedReply !== undefined ? current.turn.repairedReply : current.turn.reply;
        const value = typeof source === "function" ? (source as (prompt: string) => unknown)(current.prompt) : source;
        const text = typeof value === "string" ? value : `<${TAGS[role]}>${JSON.stringify(value)}</${TAGS[role]}>`;
        return { text, content: [{ type: "text", text }], stopReason: "end", usage };
      },
    };
  };

  return {
    prompts,
    remaining: () => Object.fromEntries([...queues].map(([role, turns]) => [role, turns.length]).filter(([, count]) => count !== 0)),
    agent(role) {
      const existing = agents.get(role);
      if (existing) return existing;
      const agent = createAgent({ model: "fake", harness: createHarness({ modelProvider: provider(role), tools: [createHarnessEditTools()] }) });
      agents.set(role, agent);
      return agent;
    },
    limits: () => ({ deadlineMs: 60_000, idleMs: 60_000 }),
  };
}

function firstText(request: ModelRequest): string {
  const first = request.messages?.[0];
  if (!first) return request.prompt ?? "";
  return first.content.map((block) => (block.type === "text" ? block.text : "")).join("");
}
