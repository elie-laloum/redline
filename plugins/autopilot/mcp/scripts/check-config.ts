#!/usr/bin/env node
import { containerNeedsOf, loadConfig, loadRegistry, orderByLevel } from "../lib/config.ts";
import { describeEnv } from "../lib/env.ts";
import { ToolError } from "../lib/errors.ts";

/**
 * Ce script verifie ce qui casse un run tres loin de sa cause : une
 * configuration illisible, un registre incoherent, un secret manquant. Tout se
 * detecte ici, pour deux lectures de fichier.
 */

let failed = false;

function ko(message: string): void {
  failed = true;
  console.error(`  x ${message}`);
}

function describe(error: unknown): string {
  if (error instanceof ToolError) return error.hint ? `${error.message} — ${error.hint}` : error.message;
  return error instanceof Error ? error.message : String(error);
}

try {
  const config = loadConfig();
  console.log("autopilot.yaml");
  console.log(`  ok budgets : ${Object.entries(config.budgets).map(([key, value]) => `${key}=${value}`).join(", ")}`);
  console.log(`  ok transition par defaut : ${config.jira.transitions.default.apresMr}`);
  const squads = Object.keys(config.slack.invitees.bySquad ?? {});
  console.log(`  ok allowlist slack : ${squads.length ? squads.join(", ") : "aucune squad — personne d'autre que moi"}`);
} catch (error) {
  ko(describe(error));
}

try {
  const registry = loadRegistry();
  console.log("");
  console.log("repositories.yaml");
  for (const repo of orderByLevel(registry.repositories)) {
    const kinds = (["ut", "it", "ft", "ct", "e2e"] as const).filter((kind) => repo.commands[kind]);
    const tests = kinds.length > 0 ? kinds.join(" ") : "aucun type de test declare";
    console.log(`  ok L${repo.level} ${repo.name.padEnd(24)} ${tests}`);
    if (kinds.length === 0) {
      console.log("        ! le red-checker et le green-checker n'auront rien a lancer sur ce repo");
    }
    const needs = containerNeedsOf(repo);
    if (needs.required || needs.images.length > 0) {
      console.log(`        conteneurs : ${needs.images.join(", ") || "runtime seul"}`);
    }
    for (const [kind, path] of Object.entries(repo.reports ?? {})) {
      console.log(`        rapport ${kind} : ${path}`);
    }
  }
} catch (error) {
  ko(describe(error));
}

console.log("");
console.log(".env");
for (const entry of describeEnv()) {
  if (entry.present) console.log(`  ok ${entry.key}`);
  else if (entry.required) ko(`${entry.key} manquant — voir .env.example`);
  else console.log(`  .  ${entry.key} absent, facultatif`);
}

process.exit(failed ? 1 : 0);
