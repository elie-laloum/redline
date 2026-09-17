import assert from "node:assert/strict";
import { mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { after, before, describe, it } from "node:test";
import { findRepo, loadConfig, targetingFor } from "../../plugins/autopilot/mcp/lib/config.ts";
import { focusOn, run } from "../../plugins/autopilot/mcp/lib/exec.ts";
import { renderTargeting } from "../../plugins/autopilot/mcp/tools/quality.ts";
import { toolByName } from "../../plugins/autopilot/mcp/registry.ts";
import { PROJECT_ROOT, sandboxHome, sandboxProject, useProjectConfig } from "../helpers.ts";

/**
 * Ce que FT-1042 a coute, et qui ne se reproduit pas.
 *
 * Le red-checker a rendu trois fois « non verifiable » sur la suite
 * fonctionnelle de `sheet-service`. Aucun agent n'avait tort : la sortie
 * faisait 4400 lignes, `feature/lab` tombait au milieu, et la coupe garde les
 * deux bouts. Il a ensuite essaye de cibler ses trois fichiers, recu un
 * `ERR_PARSE_ARGS_UNEXPECTED_POSITIONAL`, et conclu que le repo n'etait pas
 * ciblable — il l'etait, par `-g`. Puis le compteur de boucle est monte a 4
 * pour un budget de 3, et le run s'est arrete en annoncant « budgets epuises »,
 * ce qui etait faux.
 *
 * Trois pannes, trois verrous.
 */

const noopContext = {
  canAskHuman: false,
  heartbeat: () => {},
  askHuman: async () => ({ action: "decline" as const, content: null }),
};

/** 500 lignes, et la seule qui compte au milieu — la forme exacte du piege. */
const NOISY = `node -e 'for (let i = 1; i <= 500; i++) console.log(i === 250 ? "ALTAIR le verdict cherche" : "ligne " + i)'`;

describe("la sortie d'une commande dont le verdict est au milieu", () => {
  let home: ReturnType<typeof sandboxHome>;

  before(() => {
    useProjectConfig();
    home = sandboxHome();
  });
  after(() => home.cleanup());

  it("coupe toujours par le milieu, donc perd le verdict quand il y est", async () => {
    const result = await run(NOISY, { cwd: PROJECT_ROOT, logTo: "test-coupe" });

    assert.equal(result.truncated, true);
    assert.ok(!result.stdout.includes("ALTAIR"), "la ligne du milieu ne devrait pas survivre a la coupe");
  });

  it("ecrit la sortie entiere sur disque des qu'elle ne rend pas tout", async () => {
    const result = await run(NOISY, { cwd: PROJECT_ROOT, logTo: "test-journal" });

    assert.ok(result.logPath, "une sortie coupee sans journal est une sortie perdue");
    const journal = readFileSync(result.logPath, "utf8");
    assert.ok(journal.includes("ALTAIR le verdict cherche"), "le journal doit porter ce que la coupe a mange");
    assert.ok(journal.includes("ligne 1\n"), "le journal est la sortie entiere, pas un second extrait");
  });

  it("n'ecrit aucun journal quand la sortie rendue est complete", async () => {
    const result = await run("echo court", { cwd: PROJECT_ROOT, logTo: "test-court" });

    assert.equal(result.truncated, false);
    assert.equal(result.logPath, null, "un vert de trois lignes n'a pas besoin d'un fichier");
  });

  it("garde le milieu quand on dit quoi chercher", async () => {
    const result = await run(NOISY, { cwd: PROJECT_ROOT, focus: "ALTAIR", logTo: "test-focus" });

    assert.ok(result.stdout.includes("ALTAIR le verdict cherche"), "c'est tout l'objet de `focus`");
    assert.equal(result.focusMatched, 1);
    assert.ok(result.stdout.includes("ligne 249"), "deux lignes de contexte de chaque cote");
    assert.ok(!result.stdout.includes("ligne 10\n"), "le reste n'a pas a revenir");
  });

  it("rend la sortie entiere plutot qu'un vide quand le motif ne trouve rien", () => {
    // Un filtre qui rend vide se lit comme une suite sans echec. C'est
    // exactement le faux vert que le red-checker existe pour attraper.
    const { text, filtered, matched } = focusOn("un\ndeux\ntrois", "quatre");

    assert.equal(matched, 0);
    assert.equal(filtered, false);
    assert.equal(text, "un\ndeux\ntrois");
  });

  it("ne masque rien derriere un motif invalide", () => {
    const { text, filtered } = focusOn("un\ndeux", "[");

    assert.equal(filtered, false);
    assert.equal(text, "un\ndeux");
  });
});

describe("le ciblage d'un fichier de test", () => {
  before(useProjectConfig);

  it("remplit le gabarit du repo au lieu d'empiler des positionnels", () => {
    assert.equal(
      renderTargeting("-- -g {glob}", ["./src/feature/lab/test/FT/labAltairWeights.test.ts"]),
      "-- -g './src/feature/lab/test/FT/labAltairWeights.test.ts'",
    );
  });

  it("quote les motifs, sinon le shell developpe l'etoile avant le runner", () => {
    // `shell: true` transformerait sinon `*.test.ts` en dix positionnels, sur
    // un binaire qui n'en accepte aucun. C'est la panne, deguisee.
    const rendered = renderTargeting("-- -g {glob}", ["./src/**/lab/*.test.ts"]);
    assert.ok(rendered.includes("'./src/**/lab/*.test.ts'"));
  });

  it("groupe plusieurs fichiers en un seul motif", () => {
    assert.equal(renderTargeting("-- -g {glob}", ["a.test.ts", "b.test.ts"]), "-- -g '{a.test.ts,b.test.ts}'");
  });

  it("garde l'ajout en fin de commande pour les runners qui l'acceptent", () => {
    assert.equal(renderTargeting("{paths}", ["a.test.ts", "b.test.ts"]), "'a.test.ts' 'b.test.ts'");
  });

  it("ne laisse pas un drapeau nu quand aucun fichier n'est demande", () => {
    // Un `-g` sans valeur ferait tourner le glob par defaut du runner : une
    // autre suite que celle demandee, rendue comme si c'etait la bonne.
    assert.equal(renderTargeting("-- -g {glob}", []), "");
    assert.equal(renderTargeting("-- -g {glob}", undefined), "");
  });

  it("distingue le repo qui ne declare rien de celui qui declare ne pas se cibler", () => {
    const registry = `schemaVersion: 1

repositories:
  - name: mtr-fixture
    level: 1
    path: ~/rien
    gitlabProject: fixture/mtr
    baseBranch: main
    layer: backend
    packageManager: npm
    monorepoTool: null
    packageName: null
    dependsOn: []
    commands:
      lint: null
      typecheck: null
      ut: "true"
      it: null
      ft: "true"
      ct: null
      e2e: null
    targeting:
      ut: null
      ft: "-- -g {glob}"
    ciJobsToWatch: []
    description: Fixture dont seule la suite fonctionnelle se cible.
    keywords: [fixture]

  - name: libre-fixture
    level: 1
    path: ~/rien
    gitlabProject: fixture/libre
    baseBranch: main
    layer: backend
    packageManager: npm
    monorepoTool: null
    packageName: null
    dependsOn: []
    commands:
      lint: null
      typecheck: null
      ut: "true"
      it: null
      ft: null
      ct: null
      e2e: null
    ciJobsToWatch: []
    description: Fixture dont le runner accepte les positionnels.
    keywords: [fixture]

evalOnly:
  repos: []
  jiraProjects: []
`;
    const project = sandboxProject({ registry });
    try {
      assert.equal(targetingFor(findRepo("mtr-fixture"), "ft"), "-- -g {glob}");
      assert.equal(targetingFor(findRepo("mtr-fixture"), "ut"), null, "declare non ciblable");
      assert.equal(targetingFor(findRepo("libre-fixture"), "ut"), "{paths}", "rien de declare : l'ajout en fin");
    } finally {
      project.cleanup();
      useProjectConfig();
    }
  });

  it("refuse un ciblage impossible au lieu de fabriquer une commande fausse", async () => {
    // Sur `api-service`, la suite unitaire passe par le binaire `glob` : un
    // motif de plus ELARGIT la suite. Un ciblage silencieusement inverse rend
    // un verdict sur autre chose que ce qu'on a demande.
    const registry = `schemaVersion: 1

repositories:
  - name: glob-fixture
    level: 1
    path: ~/rien
    gitlabProject: fixture/glob
    baseBranch: main
    layer: backend
    packageManager: npm
    monorepoTool: null
    packageName: null
    dependsOn: []
    commands:
      lint: null
      typecheck: null
      ut: "true"
      it: null
      ft: null
      ct: null
      e2e: null
    targeting:
      ut: null
    ciJobsToWatch: []
    description: Fixture dont la suite unitaire ne se cible pas.
    keywords: [fixture]

evalOnly:
  repos: []
  jiraProjects: []
`;
    const home = sandboxHome();
    const project = sandboxProject({ registry });
    try {
      mkdirSync(join(home.home, "worktrees", "FT-9009", "glob-fixture"), { recursive: true });
      const ut = toolByName("run-test-ut");
      assert.ok(ut);
      await assert.rejects(
        async () => ut.handler({ ticketId: "FT-9009", repo: "glob-fixture", paths: ["a.test.ts"] }, noopContext),
        /ne se cible pas par fichier/,
      );
    } finally {
      project.cleanup();
      home.cleanup();
      useProjectConfig();
    }
  });
});

describe("le budget d'une boucle", () => {
  let home: ReturnType<typeof sandboxHome>;

  before(() => {
    useProjectConfig();
    home = sandboxHome();
  });
  after(() => home.cleanup());

  const write = async (patch: unknown) => {
    const tool = toolByName("write-store-ticket");
    assert.ok(tool);
    return tool.handler({ ticketId: "FT-9001", patch }, noopContext);
  };

  // Les plafonds se lisent dans la configuration reelle, jamais en dur : un
  // arbitrage sur un budget ne doit pas casser le test du mecanisme.
  const budgets = () => loadConfig().budgets;

  it("laisse monter le compteur jusqu'a son plafond", async () => {
    const plafond = budgets().redChecker;
    for (let turn = 1; turn <= plafond; turn += 1) {
      await write({ scope: [{ name: "repo-fixture", loops: { redChecker: { __increment: 1 } } }] });
    }
    const state = (await write({})) as { state: { scope: { name: string; loops: { redChecker: number } }[] } };
    assert.equal(state.state.scope[0]?.loops.redChecker, plafond);
  });

  it("refuse le tour de trop, avant de l'ecrire", async () => {
    const plafond = budgets().redChecker;
    await assert.rejects(
      () => write({ scope: [{ name: "repo-fixture", loops: { redChecker: { __increment: 1 } } }] }),
      new RegExp(`passerait a ${plafond + 1} .*budget de ${plafond}`),
    );

    // Le refus arrive avant l'ecriture : le compteur reste juste, et la reprise
    // ne repart pas d'un etat qui accuse un tour qui n'a pas eu lieu.
    const state = (await write({})) as { state: { scope: { loops: { redChecker: number } }[] } };
    assert.equal(state.state.scope[0]?.loops.redChecker, plafond);
  });

  it("dit quoi faire a la place, plutot que de constater", async () => {
    await assert.rejects(
      () => write({ scope: [{ name: "repo-fixture", loops: { redChecker: { __increment: 1 } } }] }),
      (error: Error & { hint?: string }) => {
        assert.match(error.hint ?? "", /escalate-to-human/);
        assert.match(error.hint ?? "", /elle ne se debite pas/);
        return true;
      },
    );
  });

  it("ne dit rien d'un compteur qui n'a pas de budget", async () => {
    await write({ scope: [{ name: "repo-fixture", loops: { inventee: { __increment: 40 } } }] });
  });

  it("compte pareil une valeur absolue et un increment", async () => {
    const trop = budgets().testAdversary + 1;
    await assert.rejects(
      () => write({ scope: [{ name: "autre-repo", loops: { testAdversary: trop } }] }),
      new RegExp(`passerait a ${trop} .*budget de ${budgets().testAdversary}`),
    );
  });

  it("tient les budgets par repo, pas globalement", async () => {
    // Un repo qui a consomme ses trois tours ne penalise pas le suivant, et son
    // premier tour vaut 1 — pas l'enveloppe d'increment restee telle quelle,
    // qui rendrait ce compteur faux pour le reste du run.
    const written = (await write({
      scope: [{ name: "repo-neuf", loops: { redChecker: { __increment: 1 } } }],
    })) as { state: { scope: { name: string; loops?: { redChecker?: number } }[] } };
    const neuf = written.state.scope.find((entry) => entry.name === "repo-neuf");
    assert.equal(neuf?.loops?.redChecker, 1);
  });
});

describe("l'escalade dit ce qui a bloque", () => {
  let home: ReturnType<typeof sandboxHome>;

  before(() => {
    useProjectConfig();
    home = sandboxHome();
  });
  after(() => home.cleanup());

  it("distingue une boucle qui n'a pas converge d'un harnais qui n'a pas rendu de verdict", async () => {
    const escalate = toolByName("escalate-to-human");
    assert.ok(escalate);

    const output = (await escalate.handler(
      {
        ticketId: "FT-9002",
        reason: "La sortie de la suite fonctionnelle est coupee au milieu.",
        step: "10.3",
        repo: "service-fixture",
        cause: "environment",
      },
      noopContext,
    )) as { cause: string; note: string };

    assert.equal(output.cause, "environment");
    assert.match(output.note, /compteurs de boucle ne doivent pas avoir bouge/);
  });

  it("retombe sur la convergence quand personne ne dit la cause", async () => {
    const escalate = toolByName("escalate-to-human");
    assert.ok(escalate);

    const output = (await escalate.handler(
      { ticketId: "FT-9003", reason: "Trois tours d'adversaire sans accord.", step: "10.2" },
      noopContext,
    )) as { cause: string };

    assert.equal(output.cause, "convergence");
  });
});
