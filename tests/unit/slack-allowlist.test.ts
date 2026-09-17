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
    const [squad] = Object.entries(loadConfig().slack.invitees.bySquad).find(([, emails]) => emails.length > 0) ?? [];
    assert.ok(squad, "la configuration ne declare aucune squad peuplee");
    const resolved = inviteesFor(`${squad}-1025`);
    assert.equal(resolved.squad, squad);
    assert.equal(resolved.fellBackToDefault, false);
    assert.ok(resolved.emails.length > 0);
  });

  it("type de ticket inconnu : je suis seul invite, et ce n'est pas une erreur", () => {
    const resolved = inviteesFor("ZZZ-1");
    assert.equal(resolved.squad, "ZZZ");
    assert.deepEqual(resolved.emails, []);
    assert.equal(resolved.fellBackToDefault, true);
  });

  it("est insensible a la casse de la cle", () => {
    const [squad = "FT"] = Object.keys(loadConfig().slack.invitees.bySquad);
    assert.deepEqual(
      [...inviteesFor(`${squad.toLowerCase()}-1025`).emails],
      [...inviteesFor(`${squad.toUpperCase()}-1025`).emails],
    );
  });

  it("une squad declaree mais vide n'invite personne, sans repli", () => {
    const invitees = { default: ["repli@x.fr"], bySquad: { REV: [] as string[] } };
    assert.deepEqual(resolveBySquad(invitees, "REV"), []);
  });

  it("le default de la configuration reelle est vide : personne d'autre que moi", () => {
    assert.deepEqual(loadConfig().slack.invitees.default, []);
  });

  it("n'invite jamais hors d'un seul et meme domaine", () => {
    // Le domaine n'est pas ecrit ici : il varie avec l'organisation. Ce qui est
    // verifie, c'est qu'une adresse etrangere ne se glisse pas dans une liste.
    const { bySquad } = loadConfig().slack.invitees;
    const domains = new Set<string>();
    for (const [squad, emails] of Object.entries(bySquad)) {
      for (const email of emails) {
        assert.match(email, /^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i, `${squad} : ${email} n'est pas une adresse`);
        domains.add(email.split("@")[1]!.toLowerCase());
      }
    }
    assert.ok(domains.size <= 1, `plusieurs domaines dans l'allowlist : ${[...domains].join(", ")}`);
  });
});
