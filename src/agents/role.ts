import { join } from "node:path";
import { type AgentObservation, defineAgentTask, defineJsonResponse, type Logging, type PromptVariables, ResponseError, type Sandbox, type TaskContext } from "@elie-laloum/outpost";
import type * as v from "valibot";
import type { RoleName } from "../domain/roles.ts";
import type { AgentSource, RunObserver } from "../domain/run-events.ts";
import type { AgentFactory } from "../ports/agents.ts";
import { Escalation } from "../workflow/escalation.ts";

export const PROMPTS = join(import.meta.dir, "..", "prompts");

export interface Role<I, O> {
  readonly name: RoleName;
  readonly prompt: string;
  readonly tag: string;
  values(input: I): PromptVariables;
  schema(input: I): v.GenericSchema<unknown, O>;
}

export function defineRole<I, S extends v.GenericSchema>(spec: {
  readonly name: RoleName;
  readonly tag: string;
  readonly values: (input: I) => PromptVariables;
  readonly schema: S | ((input: I) => S);
}): Role<I, v.InferOutput<S>> {
  return {
    name: spec.name,
    prompt: join(PROMPTS, `${spec.name}.md`),
    tag: spec.tag,
    values: spec.values,
    schema: (input) => (typeof spec.schema === "function" ? spec.schema(input) : spec.schema),
  };
}

export interface AgentSession {
  readonly sandbox: Sandbox;
  readonly agents: AgentFactory;
  readonly logging?: Logging;
  readonly source: AgentSource;
  readonly events?: RunObserver;
}

export async function ask<I, O>(context: TaskContext, session: AgentSession, role: Role<I, O>, input: I): Promise<O> {
  const limits = session.agents.limits(role.name);
  const task = defineAgentTask<O>({
    key: role.name,
    sandbox: session.sandbox,
    request: () => ({
      agent: session.agents.agent(role.name),
      label: role.name,
      brief: { file: role.prompt, values: role.values(input) },
      response: defineJsonResponse({ tag: role.tag, schema: role.schema(input), repairs: REPAIRS }),
      deadlineMs: limits.deadlineMs,
      idleMs: limits.idleMs,
      ...(session.logging !== undefined ? { logging: session.logging } : {}),
      ...(session.events ? { observe: (event: AgentObservation) => session.events?.({ type: "agent", source: session.source, role: role.name, event }) } : {}),
    }),
  });
  try {
    return (await task.perform(context)).value;
  } catch (error) {
    if (error instanceof ResponseError) throw new Escalation("convergence", role.name, `reponse hors contrat apres ${REPAIRS} correction(s) : ${summarize(error)}`);
    throw error;
  }
}

const REPAIRS = 2;

function summarize(error: ResponseError): string {
  const issues = /"message":"([^"]+)"/g;
  const messages = [...new Set([...error.message.matchAll(issues)].map((match) => match[1]))];
  return (messages.length ? messages.join(" ; ") : error.message).slice(0, 400);
}
