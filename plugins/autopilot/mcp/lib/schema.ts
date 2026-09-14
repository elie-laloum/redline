import { ToolError } from "./errors.ts";

/**
 * Les schemas d'entree sont ecrits une seule fois, en JSON Schema, parce que
 * c'est exactement ce que le modele lit avant d'appeler un tool. Les decrire en
 * double — une fois pour le modele, une fois pour la validation — c'est
 * s'offrir deux verites qui divergent au troisieme changement.
 */

export type JsonSchema = Record<string, unknown>;

export function str(description: string, extra: JsonSchema = {}): JsonSchema {
  return { type: "string", description, ...extra };
}

export function num(description: string, extra: JsonSchema = {}): JsonSchema {
  return { type: "number", description, ...extra };
}

export function bool(description: string, extra: JsonSchema = {}): JsonSchema {
  return { type: "boolean", description, ...extra };
}

export function enumOf(description: string, values: readonly string[], extra: JsonSchema = {}): JsonSchema {
  return { type: "string", description, enum: [...values], ...extra };
}

export function arr(description: string, items: JsonSchema, extra: JsonSchema = {}): JsonSchema {
  return { type: "array", description, items, ...extra };
}

export function obj(
  properties: Record<string, JsonSchema>,
  required: readonly string[] = [],
  extra: JsonSchema = {},
): JsonSchema {
  return { type: "object", properties, required: [...required], additionalProperties: false, ...extra };
}

export function anyValue(description: string): JsonSchema {
  return { description };
}

export function validate(schema: JsonSchema, value: unknown, path = "input"): void {
  if (schema.enum && Array.isArray(schema.enum) && !schema.enum.includes(value as never)) {
    throw new ToolError(`${path} : valeur ${JSON.stringify(value)} hors des valeurs admises.`, `Admis : ${schema.enum.join(", ")}`);
  }

  const type = schema.type as string | undefined;
  if (!type) return;

  if (value === null || value === undefined) {
    throw new ToolError(`${path} : champ requis manquant.`);
  }

  switch (type) {
    case "string":
      if (typeof value !== "string") throw new ToolError(`${path} : chaine attendue, recu ${typeName(value)}.`);
      break;
    case "number":
      if (typeof value !== "number" || Number.isNaN(value)) {
        throw new ToolError(`${path} : nombre attendu, recu ${typeName(value)}.`);
      }
      break;
    case "boolean":
      if (typeof value !== "boolean") throw new ToolError(`${path} : booleen attendu, recu ${typeName(value)}.`);
      break;
    case "array": {
      if (!Array.isArray(value)) throw new ToolError(`${path} : liste attendue, recu ${typeName(value)}.`);
      const items = schema.items as JsonSchema | undefined;
      if (items) value.forEach((entry, index) => validate(items, entry, `${path}[${index}]`));
      break;
    }
    case "object": {
      if (typeof value !== "object" || Array.isArray(value)) {
        throw new ToolError(`${path} : objet attendu, recu ${typeName(value)}.`);
      }
      const properties = (schema.properties ?? {}) as Record<string, JsonSchema>;
      const required = (schema.required ?? []) as string[];
      const record = value as Record<string, unknown>;
      for (const key of required) {
        if (record[key] === undefined || record[key] === null) {
          throw new ToolError(`${path}.${key} : champ requis manquant.`);
        }
      }
      for (const [key, entry] of Object.entries(record)) {
        const child = properties[key];
        if (child && entry !== undefined && entry !== null) validate(child, entry, `${path}.${key}`);
      }
      break;
    }
    default:
      break;
  }
}

function typeName(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return "liste";
  return typeof value;
}
