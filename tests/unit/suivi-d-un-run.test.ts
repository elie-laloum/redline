import assert from "node:assert/strict";
import { describe, it } from "bun:test";
import { type Ledger, newLedger } from "../../src/app/ledger.ts";
import { NO_SESSION, readSessions, type Sessions, watched } from "../../src/cli/dashboard/watch.ts";
import { exampleSettings } from "../helpers.ts";

const LEDGER = newLedger({ key: "FT-1", squad: "FT", title: "Filtrer", url: "https://jira/FT-1", notes: null, figmaOverrides: [], budgets: exampleSettings().budgets });

function watch(sessions: Sessions, running: number | null, ledger: Partial<Ledger> | null = {}, journaled = true) {
  return watched({ key: "FT-1", sessions, running, journaled, ledger: () => (ledger ? { ...LEDGER, ...ledger } : null) });
}

describe("le suivi d'un run depuis un autre terminal", () => {
  it("retient la derniere session et son issue, une nouvelle session effacant la precedente", () => {
    const ended = readSessions(NO_SESSION, [{ at: 1, session: { pid: 10 } }, { at: 2, event: { type: "output", task: "t", value: null } }, { at: 3, outcome: { status: "cancelled" } }]);
    assert.deepEqual(ended, { pid: 10, outcome: { status: "cancelled" }, at: 3 });
    assert.deepEqual(readSessions(ended, [{ at: 4, session: { pid: 11 } }]), { pid: 11, outcome: null, at: 4 });
  });

  it("dit un run en cours tant que le process qui le tient vit", () => {
    assert.deepEqual(watch({ pid: 10, outcome: null, at: 5 }, 10), { kind: "running", pid: 10 });
  });

  it("dit comment une session s'est terminee, avec la suite a donner", () => {
    const escalation = { kind: "convergence" as const, task: "core.code/adversaire", detail: "budget epuise", at: "" };
    const state = watch({ pid: 10, outcome: { status: "escalated", escalation }, at: 9 }, null);
    assert.equal(state.kind, "ended");
    assert.ok(state.kind === "ended" && state.tone === "error" && state.at === 9 && !state.interrupted);
    assert.match(state.kind === "ended" ? state.text : "", /Escalade convergence sur core\.code\/adversaire[\s\S]*resume FT-1 --fresh/);
  });

  it("dit interrompu un run dont le process est mort sans ecrire d'issue", () => {
    const state = watch({ pid: 10, outcome: null, at: 7 }, null);
    assert.ok(state.kind === "ended" && state.interrupted && state.at === 7);
    assert.match(state.kind === "ended" ? state.text : "", /sans fin propre \(pid 10\)\. Reprends avec : bun redline resume FT-1/);
  });

  it("lit l'issue d'un run anterieur au journal dans son ledger, et le dit", () => {
    const stopped = watch(NO_SESSION, null, { phase: "delivery", updatedAt: "2026-09-30T10:00:00.000Z" }, false);
    assert.ok(stopped.kind === "ended" && stopped.interrupted && stopped.at === Date.parse("2026-09-30T10:00:00.000Z"));
    assert.match(stopped.kind === "ended" ? stopped.text : "", /^Run anterieur au journal[^\n]*\nArrete en livraison\. Reprends avec/);

    const escalation = { kind: "arbitrage" as const, task: "plan", detail: "a toi", at: "" };
    const escalated = watch(NO_SESSION, null, { phase: "escalated", escalation }, false);
    assert.ok(escalated.kind === "ended" && escalated.tone === "error" && !escalated.interrupted);
  });

  it("dit supprime un run dont le ledger a disparu", () => {
    const state = watch(NO_SESSION, null, null, false);
    assert.match(state.kind === "ended" ? state.text : "", /supprime/);
  });
});
