import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { after, before, describe, it } from "node:test";
import { ticketStatePath } from "../../plugins/autopilot/mcp/lib/paths.ts";
import { type Json, emptyTicketState, mergePatch, patchTicketState, readTicketState } from "../../plugins/autopilot/mcp/lib/store.ts";
import { parseYaml } from "../../plugins/autopilot/mcp/lib/yaml.ts";
import { sandboxHome } from "../helpers.ts";

/**
 * C'est le test qui compte le plus du projet.
 *
 * Un ecrasement silencieux de champ est le bug le plus cher du systeme : il ne
 * se voit pas au moment ou il arrive, seulement a la reprise suivante, quand le
 * run repart au mauvais endroit sans dire pourquoi.
 */

describe("mergePatch", () => {
  it("fusionne les objets en profondeur sans toucher aux cles absentes du patch", () => {
    const base: Json = { run: { phase: "cadrage", step: "3", currentRepo: null }, metrics: { humanInterventions: 2 } };
    const merged = mergePatch(base, { run: { step: "4" } });
    assert.deepEqual(merged, {
      run: { phase: "cadrage", step: "4", currentRepo: null },
      metrics: { humanInterventions: 2 },
    });
  });

  it("absent du patch ne veut pas dire vide", () => {
    const base: Json = { scope: [{ name: "web-app", commits: ["a1b2c3d"] }] };
    const merged = mergePatch(base, { run: { step: "10.4" } }) as Record<string, Json>;
    assert.deepEqual(merged.scope, [{ name: "web-app", commits: ["a1b2c3d"] }]);
  });

  it("null efface explicitement", () => {
    const merged = mergePatch({ run: { escalation: { reason: "budget" } } }, { run: { escalation: null } });
    assert.deepEqual(merged, { run: { escalation: null } });
  });

  it("fusionne les listes d'objets par identite, sans ecraser les autres entrees", () => {
    const base: Json = {
      scope: [
        { name: "design-system", status: "done", level: 2 },
        { name: "web-app", status: "pending", level: 4 },
      ],
    };
    const merged = mergePatch(base, { scope: [{ name: "web-app", status: "in-progress" }] }) as Record<string, Json>;
    assert.deepEqual(merged.scope, [
      { name: "design-system", status: "done", level: 2 },
      { name: "web-app", status: "in-progress", level: 4 },
    ]);
  });

  it("ajoute a la fin une entree de liste inconnue", () => {
    const merged = mergePatch({ scope: [{ name: "web-app" }] }, { scope: [{ name: "api-client", level: 3 }] }) as Record<
      string,
      Json
    >;
    assert.deepEqual(merged.scope, [{ name: "web-app" }, { name: "api-client", level: 3 }]);
  });

  it("empile les listes de scalaires sans doublon, dans l'ordre", () => {
    const merged = mergePatch({ commits: ["a1b2c3d"] }, { commits: ["a1b2c3d", "e4f5a6b"] }) as Record<string, Json>;
    assert.deepEqual(merged.commits, ["a1b2c3d", "e4f5a6b"]);
  });

  it("__replace remplace une liste entiere quand c'est vraiment ce qu'on veut", () => {
    const merged = mergePatch({ commits: ["a", "b"] }, { commits: { __replace: [] } }) as Record<string, Json>;
    assert.deepEqual(merged.commits, []);
  });

  it("__increment additionne au lieu d'ecraser", () => {
    const once = mergePatch({ metrics: { humanInterventions: 2 } }, { metrics: { humanInterventions: { __increment: 1 } } });
    assert.deepEqual(once, { metrics: { humanInterventions: 3 } });
  });

  it("__increment part de zero sur un compteur absent", () => {
    assert.deepEqual(mergePatch({}, { loops: { greenChecker: { __increment: 1 } } }), { loops: { greenChecker: 1 } });
  });

  it("deux agents qui incrementent sans se voir arrivent au bon total", () => {
    let state: Json = { metrics: { humanInterventions: 0 } };
    state = mergePatch(state, { metrics: { humanInterventions: { __increment: 1 } } });
    state = mergePatch(state, { metrics: { humanInterventions: { __increment: 1 } } });
    assert.deepEqual(state, { metrics: { humanInterventions: 2 } });
  });

  it("un agent au contexte perime n'efface pas le travail d'un autre", () => {
    // L'agent A ecrit le scope complet, l'agent B ne connait que son repo.
    const afterA: Json = mergePatch(emptyTicketState("FT-1025"), {
      scope: [
        { name: "design-system", level: 2, status: "done", commits: ["a1b2c3d"] },
        { name: "web-app", level: 4, status: "pending" },
      ],
    });
    const afterB = mergePatch(afterA, { scope: [{ name: "web-app", status: "in-progress" }] }) as Record<string, Json>;
    const scope = afterB.scope as Record<string, Json>[];
    assert.equal(scope.length, 2);
    assert.deepEqual(scope[0]?.commits, ["a1b2c3d"]);
    assert.equal(scope[0]?.status, "done");
    assert.equal(scope[1]?.status, "in-progress");
  });
});

describe("patchTicketState", () => {
  const sandbox = sandboxHome();
  after(() => sandbox.cleanup());
  before(() => sandbox);

  it("cree le squelette complet au premier ecrit, workflow2 compris", () => {
    const state = patchTicketState("FT-1025", { run: { step: "1" } }) as Record<string, Json>;
    assert.equal(state.schemaVersion, 1);
    assert.deepEqual((state.ticket as Record<string, Json>).squad, "FT");
    // Le bloc workflow2 existe des la v2 pour qu'aucun ticket n'ait a etre migre.
    assert.ok(state.workflow2);
  });

  it("horodate chaque ecriture", () => {
    const first = patchTicketState("FT-1026", { run: { step: "1" } }) as Record<string, Json>;
    const firstRun = first.run as Record<string, Json>;
    const second = patchTicketState("FT-1026", { run: { step: "2" } }) as Record<string, Json>;
    const secondRun = second.run as Record<string, Json>;
    assert.ok(String(secondRun.updatedAt) >= String(firstRun.updatedAt));
  });

  it("ecrit un yaml relisible, ou rien ne se coerce en autre chose", () => {
    patchTicketState("FT-1027", {
      ticket: { slug: "no", title: "Filtre 1.10" },
      scope: [{ name: "web-app", publication: { tag: "v2.4.0-FT-1027-1", n: 1 } }],
    });
    const raw = readFileSync(ticketStatePath("FT-1027"), "utf8");
    const parsed = parseYaml<Record<string, any>>(raw);
    assert.equal(parsed.ticket.slug, "no", "un slug `no` ne doit pas devenir false");
    assert.equal(typeof parsed.ticket.slug, "string");
    assert.equal(parsed.scope[0].publication.tag, "v2.4.0-FT-1027-1");
  });

  it("relit ce qu'il a ecrit", () => {
    patchTicketState("FT-1028", { plan: { content: "ligne 1\nligne 2\n" } });
    const reread = readTicketState("FT-1028") as Record<string, Json>;
    assert.equal((reread.plan as Record<string, Json>).content, "ligne 1\nligne 2\n");
  });

  it("rend null sur un ticket jamais lance", () => {
    assert.equal(readTicketState("FT-9999"), null);
  });
});
