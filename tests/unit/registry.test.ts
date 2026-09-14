import assert from "node:assert/strict";
import { before, describe, it } from "node:test";
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
import { useProjectConfig } from "../helpers.ts";

before(useProjectConfig);

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

describe("orderByLevel", () => {
  it("ordonne amont vers aval", () => {
    const ordered = orderByLevel([findRepo("web-app"), findRepo("ui-theme"), findRepo("design-system")]);
    assert.deepEqual(
      ordered.map((repo) => repo.name),
      ["ui-theme", "design-system", "web-app"],
    );
  });

  it("est stable a level egal", () => {
    const ordered = orderByLevel([findRepo("sheet-service"), findRepo("api-service")]);
    assert.deepEqual(
      ordered.map((repo) => repo.name),
      ["api-service", "sheet-service"],
    );
  });
});

describe("selection de commande par type", () => {
  it("rend la commande declaree", () => {
    assert.equal(commandFor(findRepo("web-app"), "ut"), "pnpm turbo run rstest:ci --continue");
  });

  it("rend null quand le type n'existe pas dans le repo, au lieu d'en inventer une", () => {
    assert.equal(commandFor(findRepo("ui-theme"), "ut"), null);
    assert.equal(commandFor(findRepo("web-app"), "e2e"), null);
  });

  it("echoue clairement sur un repo inconnu", () => {
    assert.throws(() => findRepo("nope"), /Repo inconnu du registre/);
  });
});

describe("filtres monorepo", () => {
  it("rend des --filter pour turbo", () => {
    assert.equal(filterFlags(findRepo("web-app"), ["@app/web", "@app/lab"]), "--filter=@app/web --filter=@app/lab");
  });

  it("ne rend rien pour un repo qui n'est pas un monorepo", () => {
    assert.equal(filterFlags(findRepo("design-system"), ["quoi-que-ce-soit"]), "");
  });

  it("ne rend rien quand aucun paquet n'a bouge", () => {
    assert.equal(filterFlags(findRepo("web-app"), []), "");
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

describe("cloisonnement des repos de banc d'essai", () => {
  it("garde les repos d'eval hors d'un vrai ticket", () => {
    assert.equal(isRepoEligible(findRepo("autopilot-eval-frontend"), "FT-1025"), false);
    assert.equal(isRepoEligible(findRepo("web-app"), "FT-1025"), true);
  });

  it("garde les vrais repos hors d'un ticket de test", () => {
    assert.equal(isRepoEligible(findRepo("web-app"), "TJ-731"), false);
    assert.equal(isRepoEligible(findRepo("autopilot-eval-frontend"), "TJ-731"), true);
  });
});
