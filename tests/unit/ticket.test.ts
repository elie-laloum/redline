import assert from "node:assert/strict";
import { describe, it } from "bun:test";
import { collectUrls, extractAcceptanceCriteria, flattenDocument, splitCriteria } from "../../src/domain/acceptance.ts";
import { ticket } from "../../src/agents/render.ts";
import { normalizeKey, referencesOf, titleDrift } from "../../src/domain/ticket.ts";
import { TICKET } from "../kit/samples.ts";

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

describe("les tickets associes", () => {
  const site = "https://org.atlassian.net";

  it("rassemble parent, sous-taches, liens formels dans les deux sens et URL du meme site", () => {
    const references = referencesOf({
      key: "FT-1",
      site,
      parent: { key: "FT-100" },
      subtasks: [{ key: "FT-2" }],
      issuelinks: [
        { type: { inward: "is blocked by", outward: "blocks" }, outwardIssue: { key: "FT-3" } },
        { type: { inward: "is blocked by", outward: "blocks" }, inwardIssue: { key: "OPS-4" } },
      ],
      links: [`${site}/browse/FT-5`, "https://autre.atlassian.net/browse/FT-6", `${site}/browse/FT-1`, `${site}/browse/FT-3`, "https://figma.com/design/ABC"],
    });
    assert.deepEqual(references, [
      { key: "FT-100", relation: "parent" },
      { key: "FT-2", relation: "sous-tache" },
      { key: "FT-3", relation: "blocks" },
      { key: "OPS-4", relation: "is blocked by" },
      { key: "FT-5", relation: "cite dans la description" },
    ]);
  });

  it("les donne aux agents comme du contexte, avec ceux qui n'ont pas pu etre lus", () => {
    const rendered = ticket(
      {
        ...TICKET,
        related: [
          { key: "FT-100", relation: "parent", title: "Refonte des filtres", issueType: "Epic", status: "En cours", url: `${site}/browse/FT-100`, description: "Tous les filtres passent a la periode." },
          { key: "OPS-4", relation: "is blocked by", unavailable: "Ticket Jira OPS-4 introuvable, ou invisible pour moi@test." },
        ],
      },
      "Pas de migration de donnees.",
    );
    assert.match(rendered, /Tickets associes — du contexte : le perimetre reste celui du ticket ci-dessus\./);
    assert.match(rendered, /### FT-100 — Refonte des filtres \(parent ; Epic, En cours\)[\s\S]*Tous les filtres passent a la periode\./);
    assert.match(rendered, /### OPS-4 \(is blocked by\) — illisible : Ticket Jira OPS-4 introuvable/);
    assert.match(rendered, /Notes de l'humain au lancement : Pas de migration de donnees\.$/);
  });

  it("ne change rien pour un ticket fige avant leur arrivee", () => {
    const { related: _related, references: _references, ...older } = TICKET;
    assert.doesNotMatch(ticket(older, null), /Tickets associes/);
  });
});
