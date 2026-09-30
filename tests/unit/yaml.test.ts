import assert from "node:assert/strict";
import { describe, it } from "bun:test";
import { parseYaml, stringifyStrict } from "../../src/adapters/yaml.ts";

describe("serialiseur strict", () => {
  const nasty = {
    slug: "no",
    reponse: "yes",
    bascule: "on",
    version: "1.10",
    numero: "007",
    vide: "",
    date: "2026-09-15",
    tilde: "~",
    nul: "null",
    sharp: "# pas un commentaire",
    deuxPoints: "cle: valeur",
    vraiNombre: 3,
    vraiBooleen: true,
    vraiNull: null,
  };

  it("relit a l'identique tout ce qui pourrait se coercer", () => {
    assert.deepEqual(parseYaml(stringifyStrict(nasty)), nasty);
  });

  it("quote les chaines et laisse les scalaires nus", () => {
    const text = stringifyStrict(nasty);
    assert.match(text, /slug: "no"/);
    assert.match(text, /version: "1\.10"/);
    assert.match(text, /vraiNombre: 3$/m);
    assert.match(text, /vraiBooleen: true$/m);
    assert.match(text, /vraiNull: null$/m);
  });

  it("garde le multiligne en bloc, pour que le ledger reste relisible a la main", () => {
    const text = stringifyStrict({ plan: "Repo 1 : design-system\nRepo 2 : web-app\n" });
    assert.match(text, /plan: \|/);
    assert.deepEqual(parseYaml(text), { plan: "Repo 1 : design-system\nRepo 2 : web-app\n" });
  });

  it("retombe sur le quoting quand le bloc ne saurait pas representer la chaine", () => {
    const value = { texte: "ligne avec espace \nsuite" };
    const text = stringifyStrict(value);
    assert.doesNotMatch(text, /texte: \|/);
    assert.deepEqual(parseYaml(text), value);
  });

  it("relit les listes et les objets imbriques", () => {
    const value = { scope: [{ name: "design-system", level: 2, commits: ["a1b2c3d"], release: { tag: "v2.4.0-FT-1025-1" } }] };
    assert.deepEqual(parseYaml(stringifyStrict(value)), value);
  });

  it("survit aux accents et aux caracteres speciaux", () => {
    const value = { titre: "Ajouter le filtre par période — « feuilles » de lab" };
    assert.deepEqual(parseYaml(stringifyStrict(value)), value);
  });
});
