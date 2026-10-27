import assert from "node:assert/strict";
import { describe, it } from "bun:test";
import { refusedCheckpoint, staleCheckpoint } from "../../src/app/driver.ts";

/** The three refusals outpost can raise, taken verbatim from its validators. */
const OUTPOST = [
  "Invalid or incompatible workflow checkpoint",
  "Invalid or incompatible workflow loop checkpoint",
  "Invalid or incompatible speculation checkpoint",
];

describe("le checkpoint que les definitions en cours ne relisent plus", () => {
  it("est reconnu quelle que soit la sorte nommee par outpost", () => {
    for (const message of OUTPOST) assert.equal(staleCheckpoint(new Error(message)), true, message);
  });

  it("laisse passer ce qui n'est pas un refus de checkpoint", () => {
    assert.equal(staleCheckpoint(new Error("Agent produced no output before the idle deadline")), false);
    assert.equal(staleCheckpoint(new Error("checkpoint written")), false);
    assert.equal(staleCheckpoint(new Error("incompatible node version")), false);
  });

  it("ne confond pas une valeur qui n'est pas une erreur", () => {
    assert.equal(staleCheckpoint("Invalid or incompatible workflow loop checkpoint"), false);
    assert.equal(staleCheckpoint(null), false);
  });

  it("ne met la version en cause que pour la sorte dont elle fait l'identite", () => {
    const [workflow, loop, speculation] = OUTPOST.map((message) => refusedCheckpoint(new Error(message)));
    assert.match(workflow ?? "", /version de redline et des briefs/);
    assert.doesNotMatch(loop ?? "", /version/);
    assert.doesNotMatch(speculation ?? "", /version/);
    assert.notEqual(loop, speculation);
  });
});
