import type { JsonSchema } from "./schema.ts";

/**
 * Un tool est deterministe, testable en eval, et ne consomme pas de contexte.
 * La regle qui decide : toute action faite a chaque run de facon constante est
 * un tool, pas une instruction d'agent.
 */
export interface ToolContext {
  /**
   * Pose une question a l'humain et bloque. Cablee sur l'elicitation MCP quand
   * le client la supporte ; c'est le repli terminal d'`ask-user`.
   */
  readonly askHuman: (
    message: string,
    fields: Readonly<Record<string, { title: string; description?: string }>>,
  ) => Promise<{ action: "accept" | "decline" | "cancel"; content: Record<string, unknown> | null }>;
  readonly canAskHuman: boolean;
}

export interface ToolDefinition<Input = Record<string, unknown>> {
  readonly name: string;
  /** Une phrase, a l'imperatif, qui dit quand l'appeler et ce qu'il rend. */
  readonly description: string;
  readonly inputSchema: JsonSchema;
  readonly handler: (input: Input, context: ToolContext) => Promise<unknown> | unknown;
}

export function defineTool<Input = Record<string, unknown>>(definition: ToolDefinition<Input>): ToolDefinition<Input> {
  return definition;
}

export type AnyTool = ToolDefinition<any>;
