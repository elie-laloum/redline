import assert from "node:assert/strict";
import { describe, it } from "bun:test";
import { branchName, mergeRequestName, slackChannelName, slugify, typeFromIssueType } from "../../src/domain/naming.ts";
import { nextDevVersion, parseDevVersion } from "../../src/domain/versions.ts";
import { exampleSettings } from "../helpers.ts";

const naming = exampleSettings().naming;

describe("slugify", () => {
  it("retire les accents et la ponctuation", () => {
    assert.equal(slugify("Ajouter le filtre par période", 40), "ajouter-le-filtre-par-periode");
  });

  it("coupe sur un tiret plutot qu'au milieu d'un mot", () => {
    const slug = slugify("Ajouter le filtre par periode sur les feuilles de laboratoire", 40);
    assert.ok(slug.length <= 40);
    assert.ok(!slug.endsWith("-"));
    assert.ok(!slug.includes("laborat"), `coupe en plein mot : ${slug}`);
  });

  it("ne laisse jamais de tiret en bord", () => {
    assert.equal(slugify("  --- Bug : 404 !!! ", 40), "bug-404");
  });
});

describe("branchName et mergeRequestName", () => {
  const parts = { type: "feature", ticket: "FT-1025", title: "Ajouter le filtre par période" };

  it("suivent la convention et partagent le meme type", () => {
    assert.equal(branchName(naming, parts), "feature/FT-1025-ajouter-le-filtre-par-periode");
    assert.equal(mergeRequestName(naming, parts, true), "Draft: feature/FT-1025: Ajouter le filtre par période");
  });

  it("refusent un type hors de naming.types", () => {
    assert.throws(() => branchName(naming, { ...parts, type: "wip" }), /Type de branche inconnu/);
  });

  it("le prefixe Draft est ce qui pilote le statut brouillon", () => {
    assert.equal(mergeRequestName(naming, { type: "bugfix", ticket: "FT-9", title: "Corriger" }, false), "bugfix/FT-9: Corriger");
  });

  it("deduisent le type du type d'issue Jira", () => {
    assert.equal(typeFromIssueType(naming, "Bug"), "bugfix");
    assert.equal(typeFromIssueType(naming, "Inconnu"), "task");
  });
});

describe("slackChannelName", () => {
  it("force les minuscules, Slack refuse les majuscules", () => {
    assert.equal(slackChannelName(naming, { ticket: "FT-1025", title: "Ajouter le filtre par période" }), "ft-1025-ajouter-le-filtre-par-periode");
  });

  it("tronque a 80 caracteres, sans laisser de tiret en bord", () => {
    const name = slackChannelName(naming, {
      ticket: "FT-1025",
      title: "Ajouter un filtre par periode sur les feuilles de travail du laboratoire et leurs annexes",
    });
    assert.ok(name.length <= 80);
    assert.ok(!name.endsWith("-"));
  });
});

describe("nextDevVersion", () => {
  it("part a 1 quand rien n'a jamais ete publie", () => {
    assert.equal(nextDevVersion("v2.4.0", "FT-1025", []), "v2.4.0-FT-1025-1");
  });

  it("incremente a partir des tags existants, jamais d'un compteur en memoire", () => {
    const tags = ["v2.3.0", "v2.4.0-FT-1025-1", "v2.4.0-FT-1025-2", "v2.4.0-FT-0999-7"];
    assert.equal(nextDevVersion("v2.4.0", "FT-1025", tags), "v2.4.0-FT-1025-3");
  });

  it("ne collisionne pas entre deux tickets sur la meme version de base", () => {
    assert.equal(nextDevVersion("v2.4.0", "FT-2000", ["v2.4.0-FT-1025-1"]), "v2.4.0-FT-2000-1");
  });

  it("ne confond pas deux versions de base", () => {
    assert.equal(nextDevVersion("v2.5.0", "FT-1025", ["v2.4.0-FT-1025-9"]), "v2.5.0-FT-1025-1");
  });

  it("est insensible a la casse de la cle", () => {
    assert.equal(nextDevVersion("v1.0.0", "ft-1", ["v1.0.0-FT-1-4"]), "v1.0.0-ft-1-5");
  });

  it("se relit", () => {
    assert.deepEqual(parseDevVersion("v2.4.0-FT-1025-3"), { base: "v2.4.0", ticket: "FT-1025", n: 3 });
    assert.equal(parseDevVersion("v2.4.0"), null);
  });
});
