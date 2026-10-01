import assert from "node:assert/strict";
import { describe, it } from "bun:test";
import { inviteesFor } from "../../src/domain/allowlist.ts";
import { resolveBySquad } from "../../src/domain/config.ts";
import { exampleSettings } from "../helpers.ts";

const slack = { ...exampleSettings().slack, invitees: { default: [], bySquad: { FT: ["first.dev@example.com", "second.dev@example.com"] } } };

describe("allowlist slack", () => {
  it("rend la liste de la squad quand elle est declaree", () => {
    const resolved = inviteesFor(slack, "FT-1025");
    assert.equal(resolved.squad, "FT");
    assert.equal(resolved.fellBackToDefault, false);
    assert.ok(resolved.emails.length > 0);
  });

  it("squad inconnue : personne d'autre que moi, et ce n'est pas une erreur", () => {
    assert.deepEqual(inviteesFor(slack, "ZZZ-1"), { squad: "ZZZ", emails: [], fellBackToDefault: true });
  });

  it("est insensible a la casse de la cle", () => {
    assert.deepEqual([...inviteesFor(slack, "ft-1025").emails], [...inviteesFor(slack, "FT-1025").emails]);
  });

  it("une squad declaree mais vide n'invite personne, sans repli", () => {
    assert.deepEqual(resolveBySquad({ default: ["repli@x.fr"], bySquad: { REV: [] as string[] } }, "REV"), []);
  });

  it("les defauts du paquet n'invitent personne", () => {
    assert.deepEqual(exampleSettings().slack.invitees, { default: [], bySquad: {} });
  });
});
