#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { ToolError } from "./lib/errors.ts";
import { validate } from "./lib/schema.ts";
import type { ToolContext } from "./lib/tool.ts";
import { ALL_TOOLS, toolByName } from "./registry.ts";

/**
 * Le serveur de tools de l'autopilot.
 *
 * Il ne decide rien : il valide une entree, appelle une fonction, rend un
 * resultat. Tout ce qui juge est dans un agent, tout ce qui est constant est
 * ici.
 */

const server = new Server(
  { name: "autopilot", version: "2.0.0" },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, () => ({
  tools: ALL_TOOLS.map((tool) => ({
    name: tool.name,
    description: tool.description,
    inputSchema: tool.inputSchema,
  })),
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const tool = toolByName(request.params.name);
  if (!tool) {
    return errorResult(`Tool inconnu : ${request.params.name}.`, `Tools disponibles : ${ALL_TOOLS.map((t) => t.name).join(", ")}`);
  }

  const input = (request.params.arguments ?? {}) as Record<string, unknown>;

  try {
    validate(tool.inputSchema, input, tool.name);
    const output = await tool.handler(input, context());
    return {
      content: [{ type: "text" as const, text: stringify(output) }],
    };
  } catch (error) {
    if (error instanceof ToolError) return errorResult(error.message, error.hint);
    const message = error instanceof Error ? error.message : String(error);
    return errorResult(`${tool.name} a echoue : ${message}`, error instanceof Error ? error.stack?.split("\n")[1]?.trim() ?? null : null);
  }
});

/**
 * Le seul canal direct vers l'humain. `ask-user` s'en sert comme repli quand le
 * live shell n'est pas la ; aucun autre tool n'a de raison d'y toucher.
 */
function context(): ToolContext {
  const capabilities = server.getClientCapabilities();
  const canAskHuman = Boolean(capabilities?.elicitation);

  return {
    canAskHuman,
    askHuman: async (message, fields) => {
      const properties: Record<string, { type: "string"; title?: string; description?: string }> = {};
      for (const [key, field] of Object.entries(fields)) {
        properties[key] = { type: "string", title: field.title, description: field.description };
      }
      const result = await server.elicitInput({
        message,
        requestedSchema: { type: "object", properties, required: Object.keys(fields) },
      });
      return {
        action: result.action,
        content: (result.content ?? null) as Record<string, unknown> | null,
      };
    },
  };
}

function stringify(output: unknown): string {
  if (typeof output === "string") return output;
  return JSON.stringify(output, replaceUndefined, 2);
}

function replaceUndefined(_key: string, value: unknown): unknown {
  return value === undefined ? null : value;
}

function errorResult(message: string, hint: string | null) {
  return {
    isError: true,
    content: [{ type: "text" as const, text: hint ? `${message}\n\n${hint}` : message }],
  };
}

await server.connect(new StdioServerTransport());
