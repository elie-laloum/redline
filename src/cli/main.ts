#!/usr/bin/env -S bun --no-env-file
import { Argument, Command, Option } from "commander";
import packageJson from "../../package.json" with { type: "json" };
import { redirectTmpdir } from "../app/home.ts";
import { homeDirectory, pathsOf } from "../app/paths.ts";
import { AUTH_MODES, type AuthMode } from "../domain/config.ts";
import { authCommand } from "./commands/auth.ts";
import { benchCommand } from "./commands/bench.ts";
import { check } from "./commands/check.ts";
import { clearCommand } from "./commands/clear.ts";
import { imageBuildCommand, imageDoctorCommand } from "./commands/image.ts";
import { migrateHomeCommand } from "./commands/migrate-home.ts";
import { resumeCommand, startCommand } from "./commands/run.ts";
import { statusCommand } from "./commands/status.ts";
import { guarded } from "./output.ts";

redirectTmpdir(pathsOf(homeDirectory()));

const program = new Command("redline")
  .description("Livraison autonome depuis un ticket Jira : cadrage, TDD adversarial, memoire, publication.")
  .version(packageJson.version);

program
  .command("start")
  .description("Cadre, livre et publie un ticket Jira")
  .argument("<ticket>", "cle ou URL du ticket")
  .option("--notes <texte>", "consigne transmise a tous les agents")
  .option("--figma <url...>", "maquettes a prendre en compte en plus de celles du ticket")
  .addOption(authOption())
  .action((ticket: string, options: { notes?: string; figma?: string[]; auth?: AuthMode }) => guarded(() => startCommand(ticket, options)));

program
  .command("resume")
  .description("Reprend un run interrompu, en attente ou escalade")
  .argument("<ticket>", "cle ou URL du ticket")
  .option("--fresh", "rouvre la tache escaladee avec un budget neuf")
  .option("--note <texte>", "consigne transmise a la tache rouverte")
  .addOption(authOption())
  .action((ticket: string, options: { fresh?: boolean; note?: string; auth?: AuthMode }) => guarded(() => resumeCommand(ticket, options)));

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
  .command("auth")
  .description("Affiche ou change l'authentification des agents : account, oauth ou key")
  .addArgument(new Argument("[mode]", "account (compte de la machine), oauth (claude setup-token) ou key (cle d'API)").choices(AUTH_MODES))
  .action((mode: AuthMode | undefined) => guarded(() => authCommand(mode)));

program
  .command("check")
  .description("Verifie reglages, registre, secrets, conteneurs et identifiants")
  .action(() => guarded(check));

program
  .command("bench")
  .description("Chronometre les commandes du registre et mesure leur plus long silence")
  .argument("[repos...]", "repos a mesurer, tous par defaut")
  .option("--kinds <liste>", "types de commande, par exemple ut,lint")
  .action((repos: string[], options: { kinds?: string }) => guarded(() => benchCommand(repos, options)));

program
  .command("migrate-home")
  .description("Reprend la memoire d'une installation autopilot")
  .option("--from <dossier>", "ancien dossier", "~/.autopilot")
  .action((options: { from?: string }) => guarded(() => migrateHomeCommand(options)));

const image = program.command("image").description("Image Docker des agents");
image.command("build").description("Construit l'image declaree dans sandbox.image").action(() => guarded(imageBuildCommand));
image.command("doctor").description("Verifie que l'image et Claude repondent dans un conteneur").action(() => guarded(imageDoctorCommand));

await program.parseAsync();

function authOption(): Option {
  return new Option("--auth <mode>", "authentification des agents pour ce run, sans changer le reglage").choices(AUTH_MODES);
}
