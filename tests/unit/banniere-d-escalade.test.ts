import assert from "node:assert/strict";
import { describe, it } from "bun:test";
import { fitNotice } from "../../src/cli/tui/text.ts";

const lines = (count: number) => Array.from({ length: count }, (_, index) => `l${index + 1}`);

describe("la banniere d'une escalade", () => {
  it("laisse intacte une notice qui tient dans la hauteur", () => {
    assert.deepEqual(fitNotice(lines(4), 8), ["l1", "l2", "l3", "l4"]);
    assert.deepEqual(fitNotice(lines(8), 8), lines(8));
  });

  it("garde l'entete et la fin, ou vit l'erreur, et compte ce qui est masque", () => {
    const fitted = fitNotice(lines(20), 8);

    assert.equal(fitted.length, 8);
    assert.equal(fitted[0], "l1");
    assert.match(fitted[1] ?? "", /^… 13 ligne\(s\) masquee\(s\)/);
    assert.deepEqual(fitted.slice(2), ["l15", "l16", "l17", "l18", "l19", "l20"]);
  });

  it("garde la fin quand il n'y a pas la place d'annoncer l'elision", () => {
    assert.deepEqual(fitNotice(lines(20), 2), ["l19", "l20"]);
    assert.deepEqual(fitNotice(lines(20), 0), []);
  });
});
