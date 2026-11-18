import assert from "node:assert/strict";
import { describe, it } from "bun:test";
import { editDescription } from "../../src/domain/description-edits.ts";

const text = (value: string, marks?: unknown[]) => ({ type: "text", text: value, ...(marks ? { marks } : {}) });
const paragraph = (...content: unknown[]) => ({ type: "paragraph", content });
const doc = (...content: unknown[]) => ({ type: "doc", version: 1, content });
const IMAGE = { type: "mediaSingle", attrs: { layout: "center" }, content: [{ type: "media", attrs: { id: "img-1", type: "file", collection: "jira" } }] };
const TABLE = { type: "table", content: [{ type: "tableRow", content: [{ type: "tableCell", content: [paragraph(text("Colonne A"))] }] }] };
const BOLD = [{ type: "strong" }];

describe("la reecriture ciblee de la description Jira", () => {
  it("ne remplace que le passage cite, et garde images, tableaux et mise en forme", () => {
    const original = doc(paragraph(text("La liste s'ouvre sur "), text("toutes les feuilles", BOLD), text(".")), IMAGE, TABLE);
    const { document, applied, missed } = editDescription(original, [{ before: "toutes les feuilles", after: "le mois en cours" }]);

    assert.deepEqual(document, doc(paragraph(text("La liste s'ouvre sur "), text("le mois en cours", BOLD), text(".")), IMAGE, TABLE));
    assert.equal(applied.length, 1);
    assert.deepEqual(missed, []);
  });

  it("reecrit un passage a cheval sur plusieurs morceaux de texte, a l'interieur d'un element de liste", () => {
    const list = { type: "bulletList", content: [{ type: "listItem", content: [paragraph(text("Le stock "), text("ne peut pas", BOLD), text(" etre negatif"))] }] };
    const { document } = editDescription(doc(list), [{ before: "stock ne peut   pas etre", after: "stock peut\netre" }]);

    assert.deepEqual(document, doc({ ...list, content: [{ type: "listItem", content: [paragraph(text("Le "), text("stock peut"), { type: "hardBreak" }, text("etre"), text(" negatif"))] }] }));
  });

  it("n'applique pas un passage introuvable ou ambigu, et reconnait un passage deja reecrit", () => {
    const original = doc(paragraph(text("Le mois en cours.")), paragraph(text("Le mois en cours.")), paragraph(text("Une periode vide rend une liste vide.")));
    const result = editDescription(original, [
      { before: "Le mois en cours.", after: "Le dernier mois clos." },
      { before: "Toutes les feuilles", after: "Aucune" },
      { before: "rend une erreur", after: "rend une liste vide" },
    ]);

    assert.deepEqual(result.document, original);
    assert.deepEqual(result.applied, []);
    assert.deepEqual(result.missed.map((edit) => edit.before), ["Le mois en cours.", "Toutes les feuilles"]);
    assert.deepEqual(result.present.map((edit) => edit.before), ["rend une erreur"]);
  });

  it("ne modifie jamais le document recu", () => {
    const original = doc(paragraph(text("Avant.")));
    editDescription(original, [{ before: "Avant.", after: "Apres." }]);
    assert.deepEqual(original, doc(paragraph(text("Avant."))));
  });
});
