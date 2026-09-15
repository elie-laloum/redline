#!/usr/bin/env node
import { rmSync } from "node:fs";
import { resolve } from "node:path";
import { materialize } from "./repos.ts";

/**
 * Ecrit les depots de fixture sur disque, pour les ouvrir a la main.
 *
 * Les tests, eux, les recreent dans un dossier temporaire a chaque cas : un
 * depot neuf par test, sans heriter du tag qu'un test precedent a pousse. Ce
 * script sert a inspecter, pas a alimenter la suite.
 *
 *   pnpm fixtures [dossier]
 */
const target = resolve(process.argv[2] ?? "tests/.fixtures");
rmSync(target, { recursive: true, force: true });

const repos = materialize(target);

console.log(`${repos.length} depots ecrits dans ${target}\n`);
for (const repo of repos) {
  console.log(`  ${repo.name.padEnd(16)} level ${repo.level}  ${repo.path}`);
  console.log(`  ${" ".repeat(16)}          remote bare : ${repo.remote}`);
}
console.log("\nA jeter quand tu as fini : rm -rf", target);
