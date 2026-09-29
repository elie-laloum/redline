#!/usr/bin/env bun
import { Command } from "commander";
import packageJson from "../../package.json" with { type: "json" };
import { check } from "./commands/check.ts";
import { clearCommand } from "./commands/clear.ts";
import { migrateHomeCommand } from "./commands/migrate-home.ts";
import { resumeCommand, startCommand } from "./commands/run.ts";
import { statusCommand } from "./commands/status.ts";
import { guarded } from "./output.ts";

const program = new Command("redline")
  .description("Livraison autonome depuis un ticket Jira : cadrage, TDD adversarial, memoire, publication.")
  .version(packageJson.version);

program
  .command("start")
  .description("Cadre, livre et publie un ticket Jira")
  .argument("<ticket>", "cle ou URL du ticket")
  .option("--notes <texte>", "consigne transmise aux grills")
  .option("--figma <url...>", "maquettes a prendre en compte en plus de celles du ticket")
  .action((ticket: string, options: { notes?: string; figma?: string[] }) => guarded(() => startCommand(ticket, options)));

program
  .command("resume")
  .description("Reprend un run interrompu, en attente ou escalade")
  .argument("<ticket>", "cle ou URL du ticket")
  .option("--fresh", "rouvre la tache escaladee avec un budget neuf")
  .option("--note <texte>", "consigne transmise a la tache rouverte")
  .action((ticket: string, options: { fresh?: boolean; note?: string }) => guarded(() => resumeCommand(ticket, options)));

program
  .command("status")
  .description("Etat des runs, ou d'un ticket")
  .argument("[ticket]", "cle ou URL du ticket")
  .option("--plan", "affiche le plan approuve")
  .action((ticket: string | undefined, options: { plan?: boolean }) => guarded(async () => statusCommand(ticket, options)));

program
  .command("clear")
  .description("Supprime l'etat local d'un ticket (worktrees, branches locales, run)")
  .argument("<ticket>", "cle ou URL du ticket")
  .option("--force", "supprime meme un worktree sale ou non pousse")
  .option("--dry-run", "liste sans rien supprimer")
  .action((ticket: string, options: { force?: boolean; dryRun?: boolean }) => guarded(() => clearCommand(ticket, options)));

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
