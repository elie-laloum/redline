import { copyFileSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { isDeepStrictEqual } from "node:util";
import * as v from "valibot";
import { Document, isMap, parse, parseDocument } from "yaml";
import { type Registry, RegistrySchema, registryProblems, type Settings, SettingsSchema } from "../domain/config.ts";
import { fail } from "../domain/failure.ts";
import { type Paths, TEMPLATES } from "./paths.ts";

export interface Configuration {
  readonly settings: Settings;
  readonly registry: Registry;
  /** The personal files in use, or null when the home has none: the package defaults, and no repository. */
  readonly sources: { readonly settings: string | null; readonly registry: string | null };
}

type Tree = Record<string, unknown>;

const EMPTY_REGISTRY: Registry = { schemaVersion: 1, repositories: [], evalOnly: { repos: [], jiraProjects: [] } };
const HEADER = " Surcharges de redline : seules les valeurs qui different des defauts du paquet.\n Les defauts, commentes : templates/redline.example.yaml du paquet.";

export function loadConfiguration(paths: Paths, templates = TEMPLATES): Configuration {
  const defaults = defaultSettings(templates);
  const own = existsSync(paths.settings) ? upgraded(paths, defaults) : null;
  const settings = checked(SettingsSchema, overlay(defaults, own ?? {}), own ? paths.settings : templateOf(templates));
  const hasRegistry = existsSync(paths.registry);
  const registry = hasRegistry ? checked(RegistrySchema, parse(readFileSync(paths.registry, "utf8")), paths.registry) : EMPTY_REGISTRY;
  const problems = registryProblems(registry);
  if (problems.length > 0) fail(`Registre incoherent (${paths.registry}) :\n- ${problems.join("\n- ")}`);
  return { settings, registry, sources: { settings: own ? paths.settings : null, registry: hasRegistry ? paths.registry : null } };
}

/** The package's settings: a personal redline.yaml only overrides them. */
export function defaultSettings(templates = TEMPLATES): Tree {
  return parse(readFileSync(templateOf(templates), "utf8")) as Tree;
}

/** The personal overrides as they are on disk, empty when the home has none. */
export function personalSettings(paths: Paths): Tree {
  if (!existsSync(paths.settings)) return {};
  const own = parse(readFileSync(paths.settings, "utf8")) as unknown;
  return isTree(own) ? own : {};
}

/** Maps merge key by key; anything else, lists included, replaces the default. */
export function overlay(base: unknown, top: unknown): unknown {
  if (!isTree(base) || !isTree(top)) return top === undefined ? base : top;
  const merged: Tree = { ...base };
  for (const [key, value] of Object.entries(top)) merged[key] = key in base ? overlay(base[key], value) : value;
  return merged;
}

/** What differs from the defaults: equal values are dropped, and the maps they leave empty with them. */
export function differences(own: unknown, defaults: unknown): unknown {
  if (!isTree(own) || !isTree(defaults)) return isDeepStrictEqual(own, defaults) ? undefined : own;
  const kept = Object.entries(own).flatMap(([key, value]) => {
    const differing = key in defaults ? differences(value, defaults[key]) : value;
    return differing === undefined ? [] : [[key, differing] as const];
  });
  return kept.length > 0 ? Object.fromEntries(kept) : undefined;
}

/** Sets one setting in the personal redline.yaml; every other line, comments included, stays as written. */
export function writeSetting(paths: Paths, key: readonly [string, ...string[]], value: unknown, templates = TEMPLATES): void {
  edit(paths, templates, (document) => document.setIn(key, value));
}

/** Drops an override: the package default applies again. */
export function resetSetting(paths: Paths, key: readonly [string, ...string[]], templates = TEMPLATES): void {
  edit(paths, templates, (document) => {
    document.deleteIn(key);
    for (let depth = key.length - 1; depth > 0; depth -= 1) {
      const parent = document.getIn(key.slice(0, depth), true);
      if (!isMap(parent) || parent.items.length > 0) break;
      document.deleteIn(key.slice(0, depth));
    }
  });
}

function edit(paths: Paths, templates: string, change: (document: Document) => void): void {
  const defaults = defaultSettings(templates);
  if (existsSync(paths.settings)) upgraded(paths, defaults);
  const document = existsSync(paths.settings) ? parseDocument(readFileSync(paths.settings, "utf8")) : fresh({});
  change(document);
  checked(SettingsSchema, overlay(defaults, document.toJS() ?? {}), paths.settings);
  writeAtomic(paths.settings, String(document));
}

/**
 * Before 4.0 the first write copied the whole template into the home, and from then on new
 * defaults never reached the user — sandbox.image changes with every release. Such a file, marked
 * schemaVersion 1, is reduced once to what differs from the defaults, the image always dropped;
 * the original is kept beside it.
 */
function upgraded(paths: Paths, defaults: Tree): Tree {
  const own = personalSettings(paths);
  if (own.schemaVersion !== 1) return own;
  const { schemaVersion: _, ...rest } = own;
  const reduced = (differences(rest, defaults) ?? {}) as Tree;
  if (isTree(reduced.sandbox)) {
    const { image: _image, ...sandbox } = reduced.sandbox;
    if (Object.keys(sandbox).length > 0) reduced.sandbox = sandbox;
    else delete reduced.sandbox;
  }
  copyFileSync(paths.settings, `${paths.settings}.3.bak`);
  const upgradedSettings = { schemaVersion: 2, ...reduced };
  writeAtomic(paths.settings, String(fresh(reduced)));
  return upgradedSettings;
}

function fresh(overrides: Tree): Document {
  const document = new Document({ schemaVersion: 2, ...overrides });
  document.commentBefore = HEADER;
  return document;
}

function writeAtomic(file: string, text: string): void {
  mkdirSync(dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.tmp`;
  writeFileSync(temporary, text, "utf8");
  renameSync(temporary, file);
}

function templateOf(templates: string): string {
  return join(templates, "redline.example.yaml");
}

function isTree(value: unknown): value is Tree {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function checked<S extends v.GenericSchema>(schema: S, data: unknown, file: string): v.InferOutput<S> {
  const result = v.safeParse(schema, data);
  if (result.success) return result.output;
  const issues = result.issues.map((issue) => `${v.getDotPath(issue) ?? "(racine)"} : ${issue.message}`);
  return fail(`${file} invalide :\n- ${issues.join("\n- ")}`);
}
