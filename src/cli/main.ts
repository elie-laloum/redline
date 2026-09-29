#!/usr/bin/env bun
import { Command } from "commander";
import packageJson from "../../package.json" with { type: "json" };
import { check } from "./commands/check.ts";
import { migrateHomeCommand } from "./commands/migrate-home.ts";
import { guarded } from "./output.ts";

const program = new Command("redline")
  .description("Livraison autonome depuis un ticket Jira : cadrage, TDD adversarial, memoire, publication.")
  .version(packageJson.version);

program
  .command("check")
  .description("Verifie reglages, registre, secrets, conteneurs et identifiants")
  .action(() => guarded(check));

program
  .command("migrate-home")
  .description("Reprend la memoire d'une installation autopilot")
  .option("--from <dossier>", "ancien dossier", "~/.autopilot")
  .action((options: { from?: string }) => guarded(() => migrateHomeCommand(options)));

await program.parseAsync();
