import assert from "node:assert/strict";
import { before, describe, it } from "node:test";
import { loadConfig, resolveBySquad } from "../../plugins/autopilot/mcp/lib/config.ts";
import { inviteesFor } from "../../plugins/autopilot/mcp/lib/slack.ts";
import { useProjectConfig } from "../helpers.ts";

before(useProjectConfig);

/**
 * Le jeton est un `xoxp-` : canal, invitations et messages sont emis sous
 * l'identite de l'utilisateur. Rien ne doit pouvoir sortir de l'allowlist, et une squad
 * inconnue ne doit jamais faire echouer un run.
 */

describe("allowlist slack", () => {
  it("rend la liste de la squad quand elle est declaree", () => {
    const resolved = inviteesFor("FT-1025");
    assert.equal(resolved.squad, "FT");
    assert.equal(resolved.fellBackToDefault, false);
    assert.ok(resolved.emails.length > 0);
    assert.ok(resolved.emails.every((email) => email.endsWith("@example.fr")));
  });

  it("type de ticket inconnu : je suis seul invite, et ce n'est pas une erreur", () => {
    const resolved = inviteesFor("ZZZ-1");
    assert.equal(resolved.squad, "ZZZ");
    assert.deepEqual(resolved.emails, []);
    assert.equal(resolved.fellBackToDefault, true);
  });

  it("est insensible a la casse de la cle", () => {
    assert.deepEqual([...inviteesFor("ft-1025").emails], [...inviteesFor("FT-1025").emails]);
  });

  it("une squad declaree mais vide n'invite personne, sans repli", () => {
    const invitees = { default: ["repli@x.fr"], bySquad: { REV: [] as string[] } };
    assert.deepEqual(resolveBySquad(invitees, "REV"), []);
  });

  it("le default de la configuration reelle est vide : personne d'autre que moi", () => {
    assert.deepEqual(loadConfig().slack.invitees.default, []);
  });

  it("aucune adresse de l'allowlist n'est hors du domaine", () => {
    const { bySquad } = loadConfig().slack.invitees;
    for (const [squad, emails] of Object.entries(bySquad)) {
      for (const email of emails) {
        assert.match(email, /^[^@\s]+@example\.fr$/, `${squad} : ${email}`);
      }
    }
  });
});
