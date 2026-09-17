import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { before, describe, it } from "node:test";
import { type CommandKind, loadRegistry } from "../../plugins/autopilot/mcp/lib/config.ts";
import { TOOLS_BY_AGENT } from "../../plugins/autopilot/mcp/registry.ts";
import { PROJECT_ROOT, useProjectConfig } from "../helpers.ts";

before(useProjectConfig);

/**
 * Une commande de test ne se compose pas, elle se lit dans le registre.
 *
 * FT-1042 a montre comment la regle cede : le plan demande dix tests de
 * composants, le repo declare `ct: null`, le `red-checker` n'a rien pour les
 * lancer — et un `pnpm playwright:component:run` finit tape a la main dans un
 * worktree. Le resultat ne passe par aucun checker et n'entre dans aucune
 * checklist. Deux heures de run sont parties a l'interpreter.
 *
 * La regle vit dans quatre prompts. Quatre prompts, c'est quatre occasions de
 * diverger, donc elle se verifie ici.
 */

const AGENTS_DIR = join(PROJECT_ROOT, "plugins", "autopilot", "agents");

/** Les agents dont le metier est de lancer des verifications. */
const CHECKERS = ["red-checker", "green-checker"];

function agentBody(name: string): string {
  return readFileSync(join(AGENTS_DIR, `${name}.md`), "utf8");
}

function agentFrontmatter(name: string): string {
  return /^---\n([\s\S]*?)\n---/.exec(agentBody(name))?.[1] ?? "";
}

describe("les agents qui lancent les verifications", () => {
  it("n'ont aucun moyen d'executer une commande eux-memes", () => {
    // Sans shell, un checker ne PEUT pas composer de commande : la regle n'a
    // plus besoin d'etre respectee, elle est structurelle.
    for (const name of CHECKERS) {
      const front = agentFrontmatter(name);
      for (const escape of ["Bash", "Write", "Edit", "Task", "Agent"]) {
        assert.ok(!new RegExp(`(^|[,:\\s])${escape}([,\\s]|$)`, "m").test(front), `${name} peut ${escape}`);
      }
    }
  });

  it("ne recoivent que des tools de lancement, jamais de quoi en inventer un", () => {
    const allowed = /^(run-test-(ut|it|ft|ct|e2e)|run-lint|run-typecheck|preflight-repo|get-repositories-registry|push-live-mode-event|escalate-to-human)$/;
    for (const name of CHECKERS) {
      for (const tool of TOOLS_BY_AGENT[name] ?? []) {
        assert.match(tool, allowed, `${name} : ${tool} n'a rien a faire chez un checker`);
      }
    }
  });

  it("savent quoi faire d'un type de test que le registre ne declare pas", () => {
    // Le reflexe a poser est l'escalade. Sans lui, l'agent d'a cote improvise.
    for (const name of CHECKERS) {
      const body = agentBody(name);
      assert.match(body, /escalate-to-human/, `${name} n'a pas de porte de sortie ecrite`);
      assert.match(body, /registre/i, `${name} ne dit pas d'ou viennent les commandes`);
    }
  });
});

describe("les agents qui decident ce qui sera teste", () => {
  it("sont prevenus qu'un `null` du registre est un interdit, pas une lacune", () => {
    // Le planner ouvre la porte, le test-writer la franchit. Les deux doivent
    // porter la regle : corriger un seul des deux laisse le trou ouvert.
    for (const name of ["planner", "test-writer"]) {
      const body = agentBody(name);
      assert.match(body, /`?null`?/, `${name} ne parle pas du null du registre`);
      assert.match(body, /commands|registre/i, `${name} ne renvoie pas au registre`);
    }
  });
});

describe("le registre", () => {
  it("ne declare aucune commande vide qui passerait pour une commande", () => {
    // Une chaine vide n'est pas un `null` : elle traverse les gardes `if
    // (!command)` du tool et se concatene au filtre, ce qui produit une
    // commande absurde lancee pour de vrai.
    const kinds: CommandKind[] = ["ut", "it", "ft", "ct", "e2e", "lint", "typecheck"];
    for (const repo of loadRegistry().repositories) {
      for (const kind of kinds) {
        const command = repo.commands?.[kind];
        assert.ok(
          command === null || command === undefined || command.trim().length > 0,
          `${repo.name}.${kind} est une chaine vide — ecris null`,
        );
      }
    }
  });

  it("declare au moins un type de test partout ou un checker sera invoque", () => {
    // Un repo sans aucun type declare n'est pas une erreur. Mais ca doit rester
    // un choix visible, pas un oubli : le registre le dit avec `withoutTests`,
    // et les deux listes doivent coincider. Une commande perdue en silence
    // ajoute un repo a gauche et pas a droite, donc ce test tombe.
    const repos = loadRegistry().repositories;
    const sansCommande = repos
      .filter((r) => !["ut", "it", "ft", "ct", "e2e"].some((k) => r.commands[k as CommandKind]))
      .map((r) => r.name);
    const declares = repos.filter((r) => r.withoutTests).map((r) => r.name);
    assert.deepEqual(
      sansCommande,
      declares,
      "un repo n'a plus aucune commande de test sans le declarer par `withoutTests: true`",
    );
  });
});

describe("les fichiers d'agent", () => {
  it("existent tous pour les noms cites par ce test", () => {
    const present = new Set(readdirSync(AGENTS_DIR).map((f) => f.replace(/\.md$/, "")));
    for (const name of [...CHECKERS, "planner", "test-writer"]) {
      assert.ok(present.has(name), `${name}.md absent`);
    }
  });
});
