import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import {
  commandFor,
  findRepo,
  isRepoEligible,
  loadConfig,
  loadRegistry,
  orderByLevel,
  resolveBySquad,
  squadOf,
} from "../../plugins/autopilot/mcp/lib/config.ts";
import { filterFlags } from "../../plugins/autopilot/mcp/lib/git.ts";
import { sandboxProject, useProjectConfig } from "../helpers.ts";

before(useProjectConfig);

/**
 * Les comportements se verifient sur un registre de fixture, jamais sur celui de
 * la machine : `repositories.yaml` est gitignore et varie d'un poste a l'autre.
 * Ce qui se verifie sur le registre reel, ce sont ses invariants — plus bas.
 */
const REGISTRE = `schemaVersion: 1

repositories:
  - name: lib-theme
    level: 1
    path: ~/fixture/lib-theme
    gitlabProject: fixture/lib-theme
    baseBranch: main
    layer: front
    packageManager: pnpm
    monorepoTool: null
    packageName: "@fixture/theme"
    dependsOn: []
    commands: { lint: pnpm lint, typecheck: pnpm typecheck, ut: null, it: null, ft: null, ct: null, e2e: null }
    withoutTests: true
    ciJobsToWatch: []
    description: Theme sans suite de test.
    keywords: [theme]

  - name: lib-ds
    level: 2
    path: ~/fixture/lib-ds
    gitlabProject: fixture/lib-ds
    baseBranch: main
    layer: front
    packageManager: yarn
    monorepoTool: null
    packageName: "@fixture/ds"
    dependsOn: [lib-theme]
    commands: { lint: yarn lint, typecheck: yarn build, ut: yarn test, it: null, ft: null, ct: null, e2e: null }
    ciJobsToWatch: [build]
    description: Librairie de composants, pas un monorepo.
    keywords: [composant]

  - name: api-a
    level: 2
    path: ~/fixture/api-a
    gitlabProject: fixture/api-a
    baseBranch: main
    layer: backend
    packageManager: npm
    monorepoTool: null
    packageName: null
    dependsOn: []
    commands: { lint: npm run lint, typecheck: npm run build, ut: npm run test:unit, it: null, ft: null, ct: null, e2e: null }
    ciJobsToWatch: [build]
    description: Service backend, meme level que api-b.
    keywords: [backend]

  - name: api-b
    level: 2
    path: ~/fixture/api-b
    gitlabProject: fixture/api-b
    baseBranch: main
    layer: backend
    packageManager: npm
    monorepoTool: null
    packageName: null
    dependsOn: []
    commands: { lint: npm run lint, typecheck: npm run build, ut: npm run test:unit, it: null, ft: null, ct: null, e2e: null }
    ciJobsToWatch: [build]
    description: Service backend, meme level que api-a.
    keywords: [backend]

  - name: app-web
    level: 3
    path: ~/fixture/app-web
    gitlabProject: fixture/app-web
    baseBranch: main
    layer: front
    packageManager: pnpm
    monorepoTool: turbo
    packageName: null
    dependsOn: [lib-ds, lib-theme]
    commands: { lint: pnpm turbo run lint, typecheck: pnpm turbo run typecheck, ut: pnpm turbo run test:unit, it: null, ft: null, ct: null, e2e: null }
    ciJobsToWatch: [build]
    description: Monorepo turbo.
    keywords: [ecran]

  - name: banc-front
    level: 1
    path: ~/fixture/banc-front
    gitlabProject: fixture/banc-front
    baseBranch: main
    layer: eval
    packageManager: pnpm
    monorepoTool: null
    packageName: null
    dependsOn: []
    commands: { lint: pnpm lint, typecheck: pnpm typecheck, ut: pnpm test, it: null, ft: null, ct: null, e2e: null }
    ciJobsToWatch: []
    description: Banc d'essai.
    keywords: [eval]

evalOnly:
  repos: [banc-front]
  jiraProjects: [TJ]
`;


describe("le registre reel", () => {
  it("se charge et declare un level pour chaque repo", () => {
    const registry = loadRegistry();
    assert.equal(registry.schemaVersion, 1);
    assert.ok(registry.repositories.length > 0);
    for (const repo of registry.repositories) {
      assert.equal(typeof repo.level, "number", `${repo.name} sans level`);
      assert.ok(repo.baseBranch, `${repo.name} sans baseBranch`);
      assert.ok(repo.gitlabProject.includes("/"), `${repo.name} sans chemin gitlab`);
    }
  });

  it("garde chaque dependance amont a un level strictement inferieur", () => {
    // C'est verifie au chargement : un dependsOn qui remonte le courant rendrait
    // l'ordre de traitement faux, et le bug apparaitrait au bump, pas ici.
    const byName = new Map(loadRegistry().repositories.map((repo) => [repo.name, repo]));
    for (const repo of byName.values()) {
      for (const upstream of repo.dependsOn) {
        assert.ok(byName.get(upstream)!.level < repo.level, `${repo.name} -> ${upstream}`);
      }
    }
  });
});

describe("le comportement du registre", () => {
  let projet: ReturnType<typeof sandboxProject>;

  before(() => {
    projet = sandboxProject({ registry: REGISTRE });
  });
  after(() => {
    projet.cleanup();
    useProjectConfig();
  });

  describe("orderByLevel", () => {
    it("ordonne amont vers aval", () => {
      const ordered = orderByLevel([findRepo("app-web"), findRepo("lib-theme"), findRepo("lib-ds")]);
      assert.deepEqual(
        ordered.map((repo) => repo.name),
        ["lib-theme", "lib-ds", "app-web"],
      );
    });

    it("est stable a level egal", () => {
      const ordered = orderByLevel([findRepo("api-b"), findRepo("api-a")]);
      assert.deepEqual(
        ordered.map((repo) => repo.name),
        ["api-a", "api-b"],
      );
    });
  });

  describe("selection de commande par type", () => {
    it("rend la commande declaree", () => {
      // Pas la commande elle-meme : elle change avec le repo, et un test qui la
      // recopie transforme une mise a jour de registre en echec de suite. Ce qui
      // compte est qu'elle vienne de la, telle quelle.
      const app = findRepo("app-web");
      assert.equal(commandFor(app, "ut"), app.commands.ut);
      assert.ok(commandFor(app, "ut")?.trim(), "app-web doit declarer une commande ut");
    });

    it("rend null quand le type n'existe pas dans le repo, au lieu d'en inventer une", () => {
      assert.equal(commandFor(findRepo("lib-theme"), "ut"), null);
      assert.equal(commandFor(findRepo("app-web"), "e2e"), null);
    });

    it("echoue clairement sur un repo inconnu", () => {
      assert.throws(() => findRepo("nope"), /Repo inconnu du registre/);
    });
  });

  describe("filtres monorepo", () => {
    it("rend des --filter pour turbo", () => {
      assert.equal(filterFlags(findRepo("app-web"), ["@app/web", "@app/lab"]), "--filter=@app/web --filter=@app/lab");
    });

    it("ne rend rien pour un repo qui n'est pas un monorepo", () => {
      assert.equal(filterFlags(findRepo("lib-ds"), ["quoi-que-ce-soit"]), "");
    });

    it("ne rend rien quand aucun paquet n'a bouge", () => {
      assert.equal(filterFlags(findRepo("app-web"), []), "");
    });
  });

  describe("cloisonnement des repos de banc d'essai", () => {
    it("garde les repos d'eval hors d'un vrai ticket", () => {
      assert.equal(isRepoEligible(findRepo("banc-front"), "FT-1025"), false);
      assert.equal(isRepoEligible(findRepo("app-web"), "FT-1025"), true);
    });

    it("garde les vrais repos hors d'un ticket de test", () => {
      assert.equal(isRepoEligible(findRepo("app-web"), "TJ-731"), false);
      assert.equal(isRepoEligible(findRepo("banc-front"), "TJ-731"), true);
    });
  });
});

describe("resolution par squad", () => {
  it("lit le prefixe de la cle Jira", () => {
    assert.equal(squadOf("FT-1025"), "FT");
    assert.equal(squadOf("rev-42"), "REV");
  });

  it("refuse une cle mal formee plutot que de deviner", () => {
    assert.throws(() => squadOf("pas-une-cle"), /Cle Jira mal formee/);
  });

  it("est insensible a la casse", () => {
    const indexed = { default: ["personne"], bySquad: { FT: ["a@x.fr"] } };
    assert.deepEqual(resolveBySquad(indexed, "ft"), ["a@x.fr"]);
    assert.deepEqual(resolveBySquad(indexed, "Ft"), ["a@x.fr"]);
    assert.deepEqual(resolveBySquad(indexed, "FT"), ["a@x.fr"]);
  });

  it("retombe sur default pour une squad inconnue, sans echouer", () => {
    const indexed = { default: ["repli"], bySquad: { FT: ["a@x.fr"] } };
    assert.deepEqual(resolveBySquad(indexed, "NOUVELLE"), ["repli"]);
  });

  it("resout la transition Jira de la configuration reelle", () => {
    const transitions = loadConfig().jira.transitions;
    assert.equal(resolveBySquad(transitions, "FT").apresMr, "VALIDATION");
    assert.equal(resolveBySquad(transitions, "TJ").apresMr, "En cours");
    assert.equal(resolveBySquad(transitions, "INCONNUE").apresMr, "VALIDATION");
  });
});
