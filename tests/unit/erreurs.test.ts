import assert from "node:assert/strict";
import { afterAll, beforeAll, describe, it } from "bun:test";
import { OutpostError } from "@elie-laloum/outpost";
import { createJira } from "../../src/adapters/jira.ts";
import { escalationOf } from "../../src/app/driver.ts";
import { describeError, RedlineError } from "../../src/domain/failure.ts";
import type { Tracker } from "../../src/ports/tracker.ts";
import { type FakeJira, fakeJira } from "../fixtures/servers.ts";

describe("un ticket Jira qui ne se lit pas", () => {
  let jira: FakeJira;
  let tracker: Tracker;

  beforeAll(async () => {
    jira = await fakeJira([{ key: "FT-1", summary: "Filtre" }]);
    tracker = createJira({ site: jira.url, email: "moi@test", token: "jeton" });
  });
  afterAll(() => jira.close());

  it("dit que le ticket manque quand les identifiants passent", async () => {
    await assert.rejects(tracker.getTicket("FT-404"), /FT-404 introuvable, ou invisible pour moi@test/);
  });

  it("dit que les identifiants sont refuses quand Jira repond 404 a un jeton revoque", async () => {
    jira.rejectCredentials = true;
    try {
      await assert.rejects(tracker.getTicket("FT-1"), (error: unknown) => {
        assert.ok(error instanceof RedlineError);
        assert.match(error.message, /Jira refuse les identifiants de moi@test/);
        assert.match(error.hint ?? "", /JIRA_API_TOKEN/);
        return true;
      });
      assert.equal(await tracker.whoami(), null);
    } finally {
      jira.rejectCredentials = false;
    }
  });

  it("donne le compte des identifiants acceptes", async () => {
    assert.deepEqual(await tracker.whoami(), { accountId: "compte-1", email: "moi@test" });
  });
});

describe("le detail d'une escalade", () => {
  const daemon = "Error response from daemon: No such image: redline-agent:claude-2.1.280";

  it("garde ce que docker a ecrit, pas seulement son code de sortie", () => {
    const error = new OutpostError("process", "docker exited with status 1", { status: 1, stdout: "", stderr: `${daemon}\n` });
    assert.equal(describeError(error), `docker exited with status 1\n${daemon}`);
  });

  it("garde l'indication d'une erreur redline et sa cause", () => {
    const error = new RedlineError("Jira refuse les identifiants.", "Verifie JIRA_API_TOKEN.");
    assert.equal(describeError(new Error("ticket en echec", { cause: error })), "ticket en echec\nJira refuse les identifiants.\nVerifie JIRA_API_TOKEN.");
  });

  it("porte le stderr du daemon jusqu'a l'escalade d'environnement", () => {
    const error = new OutpostError("process", "docker exited with status 1", { stderr: daemon });
    const escalation = escalationOf({ errors: [error], tasks: [{ key: "functional", status: "failed", error: error.message }] as never }, "framing");
    assert.equal(escalation.kind, "environment");
    assert.equal(escalation.task, "functional");
    assert.match(escalation.detail, /No such image/);
  });
});
