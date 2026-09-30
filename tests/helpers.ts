import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as v from "valibot";
import { parse } from "yaml";
import { type Registry, RegistrySchema, type Settings, SettingsSchema } from "../src/domain/config.ts";

export const PROJECT_ROOT = join(import.meta.dir, "..");
export const TEMPLATES = join(PROJECT_ROOT, "templates");

export function exampleSettings(): Settings {
  return v.parse(SettingsSchema, parse(readFileSync(join(TEMPLATES, "redline.example.yaml"), "utf8")));
}

export function exampleRegistry(): Registry {
  return registryFrom(readFileSync(join(TEMPLATES, "repositories.example.yaml"), "utf8"));
}

export function registryFrom(yaml: string): Registry {
  return v.parse(RegistrySchema, parse(yaml));
}

export function temporaryDirectory(prefix = "redline-test-"): { readonly path: string; cleanup(): void } {
  const path = mkdtempSync(join(tmpdir(), prefix));
  return { path, cleanup: () => rmSync(path, { recursive: true, force: true }) };
}

export function repoYaml(name: string, overrides: Record<string, string> = {}): string {
  const fields: Record<string, string> = {
    level: "1",
    path: "~/rien",
    gitlabProject: `fixture/${name}`,
    baseBranch: "main",
    layer: "backend",
    packageManager: "npm",
    monorepoTool: "null",
    packageName: "null",
    dependsOn: "[]",
    commands: '{ lint: null, typecheck: null, ut: "true", it: null, ft: null, ct: null, e2e: null }',
    ciJobsToWatch: "[]",
    description: "Fixture.",
    keywords: "[fixture]",
    ...overrides,
  };
  return [`  - name: ${name}`, ...Object.entries(fields).map(([key, value]) => `    ${key}: ${value}`)].join("\n");
}

export function registryYaml(...repos: string[]): string {
  return `schemaVersion: 1\nrepositories:\n${repos.join("\n")}\n`;
}
