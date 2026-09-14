import assert from "node:assert/strict";
import { before, describe, it } from "node:test";
import type { JiraTicket } from "../../plugins/autopilot/mcp/lib/jira.ts";
import { collectUrls, extractAcceptanceCriteria, flattenDocument } from "../../plugins/autopilot/mcp/lib/jira.ts";
import type { Json } from "../../plugins/autopilot/mcp/lib/store.ts";
import { fuseTicket, normalizeKey, readCursor } from "../../plugins/autopilot/mcp/lib/ticket.ts";
import { useProjectConfig } from "../helpers.ts";

before(useProjectConfig);

const JIRA: JiraTicket = {
  key: "FT-1025",
  title: "Ajouter le filtre par periode sur les feuilles de lab",
  description: "Filtrer les feuilles par periode.",
  acceptanceCriteria: "Le filtre renvoie les feuilles du mois en cours",
  issueType: "Story",
  status: "READY TO DEV",
  url: "https://your-org.atlassian.net/browse/FT-1025",
  labels: [],
  links: [],
  attachments: [],
};

const STORE: Json = {
  ticket: { key: "FT-1025", title: JIRA.title, statusAtStart: "READY TO DEV" },
  run: { phase: "implementation", step: "10.4", currentRepo: "web-app" },
  scope: [{ name: "web-app", status: "in-progress" }],
};

describe("fusion Jira / store", () => {
  it("Jira fait autorite sur le contenu, le store sur l'etat du run", () => {
    const fused = fuseTicket("FT-1025", JIRA, STORE);
    assert.equal(fused.jira?.title, JIRA.title);
    assert.equal(fused.jira?.acceptanceCriteria, JIRA.acceptanceCriteria);
    assert.deepEqual(fused.resumeAt, { phase: "implementation", step: "10.4", currentRepo: "web-app" });
    assert.equal(fused.squad, "FT");
  });

  it("marque le ticket reprenable des qu'un etat existe", () => {
    assert.equal(fuseTicket("FT-1025", JIRA, STORE).resumable, true);
    assert.equal(fuseTicket("FT-1025", JIRA, null).resumable, false);
    assert.equal(fuseTicket("FT-1025", JIRA, null).resumeAt, null);
  });

  it("signale une divergence de titre plutot que de renommer en douce", () => {
    // Le titre porte le slug de la branche, de la MR et du canal : s'il bouge
    // apres l'approbation du plan, ce n'est pas au systeme de trancher.
    const fused = fuseTicket("FT-1025", { ...JIRA, title: "Titre reecrit par la PO" }, STORE);
    assert.deepEqual(fused.diverged, ["title"]);
  });

  it("signale une divergence de statut", () => {
    const fused = fuseTicket("FT-1025", { ...JIRA, status: "En cours" }, STORE);
    assert.deepEqual(fused.diverged, ["status"]);
  });

  it("ne signale rien quand les deux sources concordent", () => {
    assert.deepEqual(fuseTicket("FT-1025", JIRA, STORE).diverged, []);
  });

  it("fonctionne sans Jira, pour une reprise avec un reseau douteux", () => {
    const fused = fuseTicket("FT-1025", null, STORE);
    assert.equal(fused.jira, null);
    assert.equal(fused.resumable, true);
    assert.deepEqual(fused.diverged, []);
  });
});

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

describe("readCursor", () => {
  it("rend null quand il n'y a pas d'etat", () => {
    assert.equal(readCursor(null), null);
    assert.equal(readCursor({ ticket: {} }), null);
  });
});

describe("lecture d'un ticket Jira", () => {
  it("aplatit un document ADF en gardant les liens", () => {
    const adf = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            { type: "text", text: "Voir la maquette " },
            { type: "text", text: "ici", marks: [{ type: "link", attrs: { href: "https://figma.com/design/ABC" } }] },
          ],
        },
      ],
    };
    const flat = flattenDocument(adf);
    assert.ok(flat.includes("Voir la maquette"));
    assert.ok(flat.includes("https://figma.com/design/ABC"));
  });

  it("extrait les criteres d'acceptation quand le ticket en porte", () => {
    const description = "Contexte.\n\nCriteres d'acceptation :\nLe filtre renvoie le mois en cours\n\nAutre chose.";
    assert.equal(extractAcceptanceCriteria(description), "Le filtre renvoie le mois en cours");
  });

  it("rend null quand le ticket n'en porte pas, au lieu d'en inventer", () => {
    assert.equal(extractAcceptanceCriteria("Juste une description."), null);
  });

  it("collecte les URL de la description et des pieces jointes", () => {
    const urls = collectUrls("Voir https://figma.com/design/ABC et https://wiki/x", [{ content: "https://cdn/att.png" }]);
    assert.deepEqual(urls.sort(), ["https://cdn/att.png", "https://figma.com/design/ABC", "https://wiki/x"]);
  });
});
