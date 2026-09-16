#!/usr/bin/env node
import { existsSync } from "node:fs";
import { type CommandKind, findRepo, loadConfig, loadRegistry, orderByLevel, repoRoot } from "../lib/config.ts";
import { runtimeStatus } from "../lib/containers.ts";
import { run, stopReason } from "../lib/exec.ts";

/**
 * Combien de temps prennent reellement les commandes d'un repo.
 *
 * Le run FT-1042 a dure dix heures et demie, dont neuf minutes de commandes
 * reellement executees. Tout le reste etait de l'attente : un daemon arrete,
 * une approbation qui ne venait pas, un cache perdu. Sans mesure, un timeout de
 * trente minutes ressemble a « les tests sont lents » — et on optimise le mauvais
 * bout.
 *
 * Ce script lance les commandes du registre a froid, chronometre, et compare aux
 * durees observees pendant le run.
 *
 *   node plugins/autopilot/mcp/scripts/bench-commands.ts [repo...] [--kinds ut,ft] [--filter <flags>]
 *
 * Il tourne sur le CLONE du registre, pas sur un worktree de ticket : c'est une
 * mesure de la machine, pas d'un run.
 *
 * `--filter` compte autant que le reste sur un monorepo. Pendant un run, les
 * commandes sont cadrees par `monorepo-filter` sur les seuls paquets touches ;
 * les lancer sans filtre mesure le monorepo entier et rend une comparaison
 * fausse d'un facteur six. Les baselines ci-dessous portent le filtre qui etait
 * en vigueur quand elles ont ete relevees.
 */

/** Pires durees observees pendant FT-1042, en secondes, avec leur filtre. */
const OBSERVED: Record<string, { filter: string; seconds: Partial<Record<CommandKind, number>> }> = {
  // Pas un monorepo : aucun filtre a appliquer.
  sheet-service: { filter: "", seconds: { ft: 93.4, ut: 19.3, lint: 12.4, typecheck: 10.0 } },
  web-app: { filter: "--filter=sheet-lab", seconds: { typecheck: 17.2, ut: 13.9, lint: 2.7, ct: 8.7 } },
};

const ALL_KINDS: CommandKind[] = ["lint", "typecheck", "ut", "it", "ft", "ct", "e2e"];

const argv = process.argv.slice(2);
const filterFlag = argv.indexOf("--filter");
const filterOverride = filterFlag === -1 ? null : (argv[filterFlag + 1] ?? "");
const kindsFlag = argv.indexOf("--kinds");
const kinds =
  kindsFlag === -1
    ? ALL_KINDS
    : (argv[kindsFlag + 1] ?? "").split(",").map((k) => k.trim()).filter(Boolean) as CommandKind[];
const consumed = new Set<number>();
for (const at of [kindsFlag, filterFlag]) {
  if (at !== -1) consumed.add(at).add(at + 1);
}
const names = argv.filter((a, i) => !consumed.has(i) && !a.startsWith("--"));

const repos = names.length
  ? names.map(findRepo)
  : orderByLevel(loadRegistry().repositories).filter((r) => r.layer !== "eval");

for (const repo of repos) {
  const cwd = repoRoot(repo);
  console.log(`\n${repo.name}  (${cwd})`);

  if (!existsSync(cwd)) {
    console.log("  ! absent du disque, ignore");
    continue;
  }

  const needs = repo.containers;
  if (needs?.required) {
    const status = await runtimeStatus(cwd);
    console.log(
      status.available
        ? `  conteneurs : ${status.detail}`
        : `  ! conteneurs : ${status.detail}\n    Les suites de ce repo vont rester muettes jusqu'au plafond. Demarre le daemon d'abord.`,
    );
    if (!status.available) continue;
  }

  const baseline = OBSERVED[repo.name];
  const filter = filterOverride ?? baseline?.filter ?? "";
  if (filter) console.log(`  filtre : ${filter}  (celui du run ; --filter le remplace, --filter "" mesure tout)`);
  // Turbo sert un resultat en cache en une seconde. Un worktree neuf n'a pas ce
  // cache, donc une mesure prise ici sans `--force` flatte la machine.
  if (repo.monorepoTool === "turbo" && !filter.includes("--force")) {
    console.log("  ! cache turbo actif : ajoute --force au filtre pour mesurer a froid, comme dans un worktree neuf");
  }

  for (const kind of kinds) {
    const command = repo.commands?.[kind];
    if (!command) continue;

    const full = [command, filter].filter(Boolean).join(" ");
    process.stdout.write(`  ${kind.padEnd(10)} ${full.slice(0, 50).padEnd(52)}`);
    // Meme garde-fou que le tool : on ne veut pas benchmarker une attente.
    const result = await run(full, { cwd, timeoutMs: 1_800_000, silenceMs: 240_000, keepLines: 5 });
    const seconds = result.durationMs / 1000;
    const before = baseline?.seconds[kind];
    const delta = before ? ` | run FT-1042 : ${before.toFixed(1)}s (${ratio(seconds, before)})` : "";
    const verdict = result.stoppedBy === "exit" ? (result.exitCode === 0 ? "vert" : `rouge(${result.exitCode})`) : "ABANDON";
    console.log(`${seconds.toFixed(1).padStart(7)}s  ${verdict}${delta}`);
    const why = stopReason(result);
    if (why) console.log(`      ${why}`);

    // Le seuil de silence se regle sur ce qu'on a mesure, pas sur une intuition.
    const silence = result.maxSilentMs / 1000;
    const budget = loadConfig().timeouts.commandSilenceSeconds;
    if (silence > budget * 0.5) {
      console.log(
        `      ! silence le plus long : ${silence.toFixed(0)}s, pour un seuil a ${budget}s. ` +
          "Marge mince — remonte commandSilenceSeconds avant qu'un jour lent ne fasse abandonner cette commande.",
      );
    } else if (silence > 5) {
      console.log(`      silence le plus long : ${silence.toFixed(0)}s (seuil ${budget}s)`);
    }
  }
}

/** Un rapport, pas une difference : « 1.1x » se lit, « +8.3s » demande un calcul. */
function ratio(now: number, before: number): string {
  if (before === 0) return "-";
  const r = now / before;
  return r >= 1 ? `${r.toFixed(1)}x plus lent ici` : `${(1 / r).toFixed(1)}x plus rapide ici`;
}
