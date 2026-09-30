import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import * as v from "valibot";
import { parse } from "yaml";
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

function validate<S extends v.GenericSchema>(schema: S, file: string): v.InferOutput<S> {
  const result = v.safeParse(schema, parse(readFileSync(file, "utf8")));
  if (result.success) return result.output;
  const issues = result.issues.map((issue) => `${v.getDotPath(issue) ?? "(racine)"} : ${issue.message}`);
  return fail(`${file} invalide :\n- ${issues.join("\n- ")}`);
}
