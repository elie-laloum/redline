import assert from "node:assert/strict";
import { describe, it } from "bun:test";
import * as v from "valibot";
import { parse } from "yaml";
import {
  commandFor,
  declaredTestKinds,
  downstreamInScope,
  eligibleRepos,
  findRepo,
  isRepoEligible,
  orderByLevel,
  RegistrySchema,
  registryProblems,
  resolveBySquad,
  targetingFor,
} from "../../src/domain/config.ts";
import { filterFlags } from "../../src/domain/monorepo.ts";
import { squadOf } from "../../src/domain/ticket.ts";
import { exampleRegistry, exampleSettings, registryFrom, registryYaml, repoYaml } from "../helpers.ts";

const REGISTRY = registryFrom(`${registryYaml(
  repoYaml("lib-theme", { layer: "front", packageName: '"@fixture/theme"', commands: "{ lint: pnpm lint, typecheck: pnpm typecheck, ut: null, it: null, ft: null, ct: null, e2e: null }", withoutTests: "true" }),
  repoYaml("lib-ds", { level: "2", layer: "front", packageName: '"@fixture/ds"', dependsOn: "[lib-theme]", commands: "{ lint: yarn lint, typecheck: yarn build, ut: yarn test, it: null, ft: null, ct: null, e2e: null }" }),
  repoYaml("api-a", { level: "2" }),
  repoYaml("api-b", { level: "2" }),
  repoYaml("app-web", { level: "3", layer: "front", monorepoTool: "turbo", dependsOn: "[lib-ds, lib-theme]" }),
  repoYaml("banc-front", { layer: "eval" }),
)}evalOnly:\n  repos: [banc-front]\n  jiraProjects: [TJ]\n`);

const repo = (name: string) => findRepo(REGISTRY, name) ?? assert.fail(`${name} absent`);

describe("le registre modele", () => {
  it("se valide et ne porte aucune incoherence", () => {
    const registry = exampleRegistry();
    assert.ok(registry.repositories.length > 0);
    assert.deepEqual(registryProblems(registry), []);
  });

  it("refuse une commande vide qui passerait pour une commande", () => {
    const yaml = registryYaml(repoYaml("vide", { commands: '{ lint: "  ", typecheck: null, ut: "true", it: null, ft: null, ct: null, e2e: null }' }));
    assert.equal(v.safeParse(RegistrySchema, parse(yaml)).success, false);
  });

  it("refuse un fichier local qui sort du depot", () => {
    const yaml = registryYaml(repoYaml("fuite", { localFiles: "[../secret]" }));
    assert.equal(v.safeParse(RegistrySchema, parse(yaml)).success, false);
  });
});

describe("la coherence du registre", () => {
  it("signale une dependance vers un repo inconnu", () => {
    const registry = registryFrom(registryYaml(repoYaml("a", { dependsOn: "[fantome]" })));
    assert.match(registryProblems(registry).join(), /fantome/);
  });

  it("signale une dependance qui remonte le courant", () => {
    const registry = registryFrom(registryYaml(repoYaml("amont", { level: "2" }), repoYaml("aval", { level: "2", dependsOn: "[amont]" })));
    assert.match(registryProblems(registry).join(), /level inferieur/);
  });

  it("exige que l'absence de tests soit declaree", () => {
    const registry = registryFrom(registryYaml(repoYaml("muet", { commands: "{ lint: null, typecheck: null, ut: null, it: null, ft: null, ct: null, e2e: null }" })));
    assert.match(registryProblems(registry).join(), /withoutTests/);
  });
});

describe("le comportement du registre", () => {
  it("ordonne amont vers aval, stable a level egal", () => {
    assert.deepEqual(orderByLevel([repo("app-web"), repo("lib-theme"), repo("lib-ds")]).map((r) => r.name), ["lib-theme", "lib-ds", "app-web"]);
    assert.deepEqual(orderByLevel([repo("api-b"), repo("api-a")]).map((r) => r.name), ["api-a", "api-b"]);
  });

  it("rend la commande declaree, ou null au lieu d'en inventer une", () => {
    assert.equal(commandFor(repo("lib-ds"), "ut"), "yarn test");
    assert.equal(commandFor(repo("lib-theme"), "ut"), null);
    assert.deepEqual(declaredTestKinds(repo("lib-ds")), ["ut"]);
  });

  it("distingue le repo qui ne declare pas de ciblage de celui qui declare ne pas se cibler", () => {
    const registry = registryFrom(registryYaml(repoYaml("mtr", { targeting: '{ ut: null, ft: "-- -g {glob}" }' }), repoYaml("libre")));
    const mtr = findRepo(registry, "mtr") ?? assert.fail();
    assert.equal(targetingFor(mtr, "ft"), "-- -g {glob}");
    assert.equal(targetingFor(mtr, "ut"), null);
    assert.equal(targetingFor(findRepo(registry, "libre") ?? assert.fail(), "ut"), "{paths}");
  });

  it("rend les filtres monorepo", () => {
    assert.equal(filterFlags(repo("app-web").monorepoTool, ["@app/web", "@app/lab"]), "--filter=@app/web --filter=@app/lab");
    assert.equal(filterFlags(repo("lib-ds").monorepoTool, ["x"]), "");
    assert.equal(filterFlags(repo("app-web").monorepoTool, []), "");
  });

  it("cloisonne les repos de banc d'essai dans les deux sens", () => {
    assert.equal(isRepoEligible(REGISTRY, repo("banc-front"), "FT"), false);
    assert.equal(isRepoEligible(REGISTRY, repo("app-web"), "FT"), true);
    assert.equal(isRepoEligible(REGISTRY, repo("app-web"), "TJ"), false);
    assert.deepEqual(eligibleRepos(REGISTRY, "TJ").map((r) => r.name), ["banc-front"]);
  });

  it("trouve les repos aval d'un amont, dans le perimetre seulement", () => {
    assert.deepEqual(downstreamInScope(REGISTRY, "lib-ds", ["lib-ds", "app-web"]).map((r) => r.name), ["app-web"]);
    assert.deepEqual(downstreamInScope(REGISTRY, "lib-ds", ["lib-ds"]), []);
  });
});

describe("resolution par squad", () => {
  it("lit le prefixe de la cle Jira et refuse une cle mal formee", () => {
    assert.equal(squadOf("FT-1025"), "FT");
    assert.equal(squadOf("rev-42"), "REV");
    assert.throws(() => squadOf("pas-une-cle"), /Cle Jira mal formee/);
  });

  it("est insensible a la casse et retombe sur default", () => {
    const indexed = { default: ["repli"], bySquad: { FT: ["a@x.fr"] } };
    assert.deepEqual(resolveBySquad(indexed, "ft"), ["a@x.fr"]);
    assert.deepEqual(resolveBySquad(indexed, "NOUVELLE"), ["repli"]);
  });

  it("resout la transition Jira, les defauts du paquet n'en declarant aucune par squad", () => {
    const transitions = exampleSettings().jira.transitions;
    assert.deepEqual(transitions.bySquad, {});
    assert.equal(resolveBySquad(transitions, "FT").afterMergeRequest, "VALIDATION");
    assert.equal(resolveBySquad({ ...transitions, bySquad: { TJ: { afterMergeRequest: "En cours" } } }, "TJ").afterMergeRequest, "En cours");
  });
});
