import assert from "node:assert/strict";
import { describe, it } from "bun:test";
import { collectUrls, extractAcceptanceCriteria, flattenDocument, splitCriteria } from "../../src/domain/acceptance.ts";
import { normalizeKey, titleDrift } from "../../src/domain/ticket.ts";

describe("normalizeKey", () => {
  it("accepte une cle, une cle en minuscules et une URL", () => {
    assert.equal(normalizeKey("FT-1025"), "FT-1025");
    assert.equal(normalizeKey("ft-1025"), "FT-1025");
    assert.equal(normalizeKey("https://your-org.atlassian.net/browse/FT-1025"), "FT-1025");
  });

  it("refuse ce qui n'est pas une cle", () => {
    assert.throws(() => normalizeKey("https://example.com"), /Cle Jira mal formee/);
  });
});

describe("lecture d'un ticket Jira", () => {
  it("aplatit un document ADF en gardant les liens", () => {
    const flat = flattenDocument({
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: "text", text: "Voir " }, { type: "text", text: "ici", marks: [{ type: "link", attrs: { href: "https://figma.com/design/ABC" } }] }] }],
    });
    assert.ok(flat.includes("Voir"));
    assert.ok(flat.includes("https://figma.com/design/ABC"));
  });

  it("garde chaque puce d'une liste de criteres, et s'arrete a la fin de la liste", () => {
    const paragraph = (text: string) => ({ type: "paragraph", content: [{ type: "text", text }] });
    const item = (text: string) => ({ type: "listItem", content: [paragraph(text)] });
    const description = flattenDocument({
      type: "doc",
      content: [paragraph("Critères d'acceptation"), { type: "bulletList", content: [item("premier"), item("second"), item("troisieme")] }, paragraph("Hors perimetre : l'export.")],
    });
    assert.deepEqual(
      splitCriteria(extractAcceptanceCriteria(description), "Titre").map((criterion) => criterion.text),
      ["premier", "second", "troisieme"],
    );
  });

  it("extrait les criteres d'acceptation, ou null au lieu d'en inventer", () => {
    assert.equal(extractAcceptanceCriteria("Contexte.\n\nCriteres d'acceptation :\nLe filtre renvoie le mois\n\nAutre."), "Le filtre renvoie le mois");
    assert.equal(extractAcceptanceCriteria("Juste une description."), null);
  });

  it("numerote les criteres, et retombe sur le titre quand il n'y en a pas", () => {
    assert.deepEqual(splitCriteria("- premier\n- second", "Titre"), [{ id: "AC1", text: "premier" }, { id: "AC2", text: "second" }]);
    assert.deepEqual(splitCriteria(null, "Ajouter le filtre"), [{ id: "AC1", text: "Ajouter le filtre" }]);
  });

  it("collecte les URL de la description et des pieces jointes", () => {
    const urls = collectUrls("Voir https://figma.com/design/ABC et https://wiki/x", [{ content: "https://cdn/att.png" }]);
    assert.deepEqual(urls.sort(), ["https://cdn/att.png", "https://figma.com/design/ABC", "https://wiki/x"]);
  });

  it("signale un titre qui a bouge depuis le gel", () => {
    assert.equal(titleDrift({ title: "A" }, { title: "B" }), true);
    assert.equal(titleDrift({ title: "A " }, { title: "A" }), false);
  });
});
