import assert from "node:assert/strict";
import { before, describe, it } from "node:test";
import {
  branchName,
  mergeRequestName,
  nextDevVersion,
  parseDevVersion,
  slackChannelName,
  slugify,
} from "../../plugins/autopilot/mcp/lib/naming.ts";
import { useProjectConfig } from "../helpers.ts";

before(useProjectConfig);

describe("slugify", () => {
  it("retire les accents et la ponctuation", () => {
    assert.equal(slugify("Ajouter le filtre par période"), "ajouter-le-filtre-par-periode");
  });

  it("coupe sur un tiret plutot qu'au milieu d'un mot", () => {
    const slug = slugify("Ajouter le filtre par periode sur les feuilles de laboratoire", 40);
    assert.ok(slug.length <= 40);
    assert.ok(!slug.endsWith("-"));
    assert.ok(!slug.includes("laborat"), `coupe en plein mot : ${slug}`);
  });

  it("ne laisse jamais de tiret en bord", () => {
    assert.equal(slugify("  --- Bug : 404 !!! "), "bug-404");
  });
});

describe("branchName et mergeRequestName", () => {
  it("suivent la convention et partagent le meme type", () => {
    const parts = { type: "feature", ticket: "FT-1025", titre: "Ajouter le filtre par période" };
    assert.equal(branchName(parts), "feature/FT-1025-ajouter-le-filtre-par-periode");
    assert.equal(mergeRequestName(parts), "Draft: feature/FT-1025: Ajouter le filtre par période");
  });

  it("refusent un type hors de naming.types", () => {
    assert.throws(() => branchName({ type: "wip", ticket: "FT-1", titre: "x" }), /Type de branche inconnu/);
  });

  it("le prefixe Draft est ce qui pilote le statut brouillon", () => {
    const sansDraft = mergeRequestName({ type: "bugfix", ticket: "FT-9", titre: "Corriger" }, false);
    assert.equal(sansDraft, "bugfix/FT-9: Corriger");
  });
});

describe("slackChannelName", () => {
  it("force les minuscules, Slack refuse les majuscules", () => {
    assert.equal(
      slackChannelName({ ticket: "FT-1025", titre: "Ajouter le filtre par période" }),
      "ft-1025-ajouter-le-filtre-par-periode",
    );
  });

  it("tronque a 80 caracteres, sans laisser de tiret en bord", () => {
    const name = slackChannelName({
      ticket: "FT-1025",
      titre: "Ajouter un filtre par periode sur les feuilles de travail du laboratoire et leurs annexes",
    });
    assert.ok(name.length <= 80, `${name.length} caracteres`);
    assert.ok(!name.endsWith("-"));
    assert.equal(name, name.toLowerCase());
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
    const tags = ["v2.4.0-FT-1025-1", "v2.4.0-FT-1025-2"];
    assert.equal(nextDevVersion("v2.4.0", "FT-2000", tags), "v2.4.0-FT-2000-1");
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
