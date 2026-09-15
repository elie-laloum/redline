import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { LIVE_EVENT_KINDS, LIVE_EVENT_STATUSES, validateEvent } from "../../plugins/autopilot/mcp/lib/events.ts";

/**
 * Un event qu'on ne sait pas valider est logge et ignore, jamais affiche a
 * moitie. Ces tests fixent ce qui passe et ce qui ne passe pas, des deux cotes
 * du transport.
 */

const VALID = {
  runId: "run-1",
  ticketId: "FT-1025",
  seq: 0,
  ts: "2026-09-15T09:12:00.000Z",
  kind: "step",
  status: "start",
  repo: null,
  agent: null,
  tool: null,
  title: "Point 1 — lecture du ticket",
  detail: null,
  payload: null,
};

describe("LiveEvent", () => {
  it("accepte un event complet", () => {
    const result = validateEvent(VALID);
    assert.equal(result.ok, true);
  });

  it("accepte tous les kinds et tous les statuts declares", () => {
    for (const kind of LIVE_EVENT_KINDS) {
      for (const status of LIVE_EVENT_STATUSES) {
        assert.equal(validateEvent({ ...VALID, kind, status }).ok, true, `${kind}/${status}`);
      }
    }
  });

  it("refuse un kind inconnu", () => {
    assert.equal(validateEvent({ ...VALID, kind: "inventé" }).ok, false);
  });

  it("refuse un titre qui ne se lit pas seul", () => {
    // « en cours » comme titre est un event rate. La longueur minimale ne le
    // rattrape pas entierement, mais elle attrape les titres vides et les `x`.
    assert.equal(validateEvent({ ...VALID, title: "" }).ok, false);
    assert.equal(validateEvent({ ...VALID, title: "x" }).ok, false);
  });

  it("refuse un seq negatif ou flottant : il donne l'ordre et detecte les trous", () => {
    assert.equal(validateEvent({ ...VALID, seq: -1 }).ok, false);
    assert.equal(validateEvent({ ...VALID, seq: 1.5 }).ok, false);
  });

  it("refuse un horodatage qui n'est pas de l'iso 8601", () => {
    assert.equal(validateEvent({ ...VALID, ts: "hier" }).ok, false);
  });

  it("accepte un event sans etape : tout l'historique ecrit avant ce champ doit rester lisible", () => {
    const { step, ...sansEtape } = { ...VALID, step: "4" };
    const result = validateEvent(sansEtape);
    assert.equal(result.ok, true);
    if (result.ok) assert.equal(result.event.step, null);
  });

  it("garde l'etape estampillee, sous-etape comprise", () => {
    const result = validateEvent({ ...VALID, step: "10.4" });
    assert.equal(result.ok, true);
    if (result.ok) assert.equal(result.event.step, "10.4");
  });

  it("refuse un champ manquant", () => {
    const { title, ...sansTitre } = VALID;
    assert.equal(validateEvent(sansTitre).ok, false);
  });

  it("refuse tout ce qui n'est pas un objet", () => {
    for (const candidate of [null, undefined, 42, "event", []]) {
      assert.equal(validateEvent(candidate).ok, false, String(candidate));
    }
  });

  it("dit quel champ ne va pas, pour qu'on corrige a la source", () => {
    const result = validateEvent({ ...VALID, seq: "zero" });
    assert.equal(result.ok, false);
    if (!result.ok) assert.ok(result.issues.some((issue) => issue.startsWith("seq")), result.issues.join(" ; "));
  });

  it("laisse passer un payload libre : chaque kind a le sien", () => {
    assert.equal(validateEvent({ ...VALID, kind: "loop", payload: { name: "codeAdversary", count: 2, budget: 3 } }).ok, true);
    assert.equal(validateEvent({ ...VALID, kind: "todo", payload: { todos: [] } }).ok, true);
  });
});
