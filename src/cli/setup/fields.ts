/** The shape of a valibot schema that the settings form reads: enough to lay a field out. */
interface SchemaNode {
  readonly type: string;
  readonly entries?: Readonly<Record<string, SchemaNode>>;
  readonly wrapped?: SchemaNode;
  readonly item?: SchemaNode;
  readonly key?: SchemaNode;
  readonly value?: SchemaNode;
  readonly options?: readonly string[];
  readonly pipe?: readonly { readonly type: string; readonly requirement?: unknown }[];
}

export type Input =
  | { readonly kind: "number"; readonly integer: boolean; readonly min: number | null }
  | { readonly kind: "boolean" }
  | { readonly kind: "text" }
  | { readonly kind: "choice"; readonly options: readonly string[] }
  | { readonly kind: "list" };

export type Path = readonly [string, ...string[]];

export type SettingRow =
  | { readonly type: "heading"; readonly path: Path }
  | {
      readonly type: "field";
      readonly path: Path;
      readonly input: Input;
      /** The key may be absent: the run then uses no value at all. */
      readonly optional: boolean;
      readonly value: unknown;
      readonly fallback: unknown;
      readonly overridden: boolean;
    }
  /** A map keyed by squad, role or issue type: a key can be added, among `keys` when they are fixed. */
  | { readonly type: "entry"; readonly path: Path; readonly keys: readonly string[] | null };

/**
 * Every key of the settings, laid out from their schema: the merged value, the package default,
 * and whether the personal file overrides it. Keys under `skip` belong to another section.
 */
export function settingRows(schema: unknown, merged: unknown, defaults: unknown, overrides: unknown, skip: readonly (readonly string[])[]): SettingRow[] {
  const rows: SettingRow[] = [];
  const walk = (node: SchemaNode, path: readonly string[], optional: boolean): void => {
    if (skip.some((prefix) => prefix.every((part, index) => path[index] === part))) return;
    if (node.type === "optional" || node.type === "nullable") {
      if (node.wrapped) walk(node.wrapped, path, true);
      return;
    }
    const at = path as Path;
    switch (node.type) {
      case "object":
        if (path.length > 0) rows.push({ type: "heading", path: at });
        for (const [key, child] of Object.entries(node.entries ?? {})) walk(child, [...path, key], false);
        return;
      case "record": {
        rows.push({ type: "heading", path: at });
        const value = valueAt(merged, path);
        const present = value && typeof value === "object" ? Object.keys(value) : [];
        for (const key of present) if (node.value) walk(node.value, [...path, key], false);
        const fixed = node.key?.type === "picklist" ? (node.key.options ?? []).filter((key) => !present.includes(key)) : null;
        if (!fixed || fixed.length > 0) rows.push({ type: "entry", path: at, keys: fixed });
        return;
      }
      case "literal":
        return;
      default: {
        const input = inputOf(node);
        if (!input) return;
        rows.push({ type: "field", path: at, input, optional, value: valueAt(merged, path), fallback: valueAt(defaults, path), overridden: valueAt(overrides, path) !== undefined });
      }
    }
  };
  walk(schema as SchemaNode, [], false);
  return rows;
}

function inputOf(node: SchemaNode): Input | null {
  switch (node.type) {
    case "boolean":
      return { kind: "boolean" };
    case "string":
      return { kind: "text" };
    case "picklist":
      return { kind: "choice", options: node.options ?? [] };
    case "array":
      return node.item && ["string", "picklist"].includes(node.item.type) ? { kind: "list" } : null;
    case "number": {
      const min = node.pipe?.find((action) => action.type === "min_value")?.requirement;
      return { kind: "number", integer: node.pipe?.some((action) => action.type === "integer") ?? false, min: typeof min === "number" ? min : null };
    }
    default:
      return null;
  }
}

/** The typed value a text typed in the form stands for, or why it cannot. Empty means absent for an optional key. */
export function parseInput(input: Input, text: string, optional: boolean): { readonly value: unknown } | { readonly error: string } {
  const trimmed = text.trim();
  if (!trimmed && optional) return { value: undefined };
  switch (input.kind) {
    case "number": {
      const value = Number(trimmed.replace(",", "."));
      if (!trimmed || !Number.isFinite(value)) return { error: "un nombre est attendu" };
      if (input.integer && !Number.isInteger(value)) return { error: "un entier est attendu" };
      if (input.min !== null && value < input.min) return { error: `au moins ${input.min}` };
      return { value };
    }
    case "boolean":
      return /^(oui|true|1)$/i.test(trimmed) ? { value: true } : /^(non|false|0)$/i.test(trimmed) ? { value: false } : { error: "oui ou non" };
    case "choice":
      return input.options.includes(trimmed) ? { value: trimmed } : { error: `une valeur parmi : ${input.options.join(", ")}` };
    case "list":
      return { value: trimmed.split(",").map((item) => item.trim()).filter(Boolean) };
    case "text":
      return trimmed ? { value: trimmed } : { error: "une valeur vide ne veut rien dire ici" };
  }
}

/** A value as the form shows it, and as it is typed back. */
export function formatValue(value: unknown): string {
  if (value === undefined || value === null) return "";
  if (Array.isArray(value)) return value.join(", ");
  if (typeof value === "boolean") return value ? "oui" : "non";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

/**
 * What a new key of a map starts with: the default of a squad-indexed setting, the default agent
 * for a role, the map's own default entry otherwise.
 */
export function seedFor(path: Path, settings: unknown): unknown {
  const parent = valueAt(settings, path.slice(0, -1));
  if (path.at(-1) === "bySquad" && parent && typeof parent === "object" && "default" in parent) return (parent as Record<string, unknown>).default;
  if (path.join(".") === "agents.byRole") return valueAt(settings, ["agents", "default"]);
  const own = valueAt(settings, path);
  return own && typeof own === "object" && "default" in own ? (own as Record<string, unknown>).default : "";
}

export function valueAt(tree: unknown, path: readonly string[]): unknown {
  return path.reduce<unknown>((node, key) => (node && typeof node === "object" ? (node as Record<string, unknown>)[key] : undefined), tree);
}
