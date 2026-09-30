import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import * as v from "valibot";
import { isMap, isScalar, parse, parseDocument } from "yaml";
import { type Registry, RegistrySchema, registryProblems, type Settings, SettingsSchema } from "../domain/config.ts";
import { fail } from "../domain/failure.ts";
import { type Paths, TEMPLATES } from "./paths.ts";

export interface Configuration {
  readonly settings: Settings;
  readonly registry: Registry;
  readonly sources: { readonly settings: string; readonly registry: string };
}

export function loadConfiguration(paths: Paths, templates = TEMPLATES): Configuration {
  const settingsFile = firstExisting(paths.settings, join(templates, "redline.example.yaml"));
  const registryFile = firstExisting(paths.registry, join(templates, "repositories.example.yaml"));
  const settings = validate(SettingsSchema, settingsFile);
  const registry = validate(RegistrySchema, registryFile);
  const problems = registryProblems(registry);
  if (problems.length > 0) fail(`Registre incoherent (${registryFile}) :\n- ${problems.join("\n- ")}`);
  return { settings, registry, sources: { settings: settingsFile, registry: registryFile } };
}

function firstExisting(...candidates: string[]): string {
  const found = candidates.find((candidate) => existsSync(candidate));
  return found ?? fail(`Aucun fichier trouve parmi : ${candidates.join(", ")}.`);
}

/**
 * Sets one scalar setting in the personal redline.yaml, created from the template if needed. Only
 * that value changes in the text: comments, alignment and every other line stay as the human
 * wrote them. A missing key is added as the first entry of its section.
 */
export function writeSetting(paths: Paths, key: readonly [string, ...string[]], value: string, templates = TEMPLATES): void {
  const source = firstExisting(paths.settings, join(templates, "redline.example.yaml"));
  const text = readFileSync(source, "utf8");
  const updated = withSetting(text, key, value) ?? fail(`Impossible de placer ${key.join(".")} dans ${source}.`, `Ajoute la ligne a la main : ${key.join(".")}: ${value}`);
  checked(SettingsSchema, parse(updated), paths.settings);
  mkdirSync(dirname(paths.settings), { recursive: true });
  const temporary = `${paths.settings}.${process.pid}.tmp`;
  writeFileSync(temporary, updated, "utf8");
  renameSync(temporary, paths.settings);
}

function withSetting(text: string, key: readonly [string, ...string[]], value: string): string | null {
  const document = parseDocument(text);
  const node = document.getIn(key, true);
  if (isScalar(node) && node.range) return text.slice(0, node.range[0]) + value + text.slice(node.range[1]);
  if (node !== undefined) return null;
  const section = document.getIn(key.slice(0, -1), true);
  if (!isMap(section) || !section.range) return null;
  const lineStart = text.lastIndexOf("\n", section.range[0] - 1) + 1;
  const indent = text.slice(lineStart, section.range[0]);
  if (!/^ +$/.test(indent)) return null;
  return `${text.slice(0, lineStart)}${indent}${key.at(-1)}: ${value}\n${text.slice(lineStart)}`;
}

function validate<S extends v.GenericSchema>(schema: S, file: string): v.InferOutput<S> {
  return checked(schema, parse(readFileSync(file, "utf8")), file);
}

function checked<S extends v.GenericSchema>(schema: S, data: unknown, file: string): v.InferOutput<S> {
  const result = v.safeParse(schema, data);
  if (result.success) return result.output;
  const issues = result.issues.map((issue) => `${v.getDotPath(issue) ?? "(racine)"} : ${issue.message}`);
  return fail(`${file} invalide :\n- ${issues.join("\n- ")}`);
}
