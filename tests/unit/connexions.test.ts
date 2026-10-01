import assert from "node:assert/strict";
import { afterAll, beforeAll, describe, it } from "bun:test";
import { createFigma } from "../../src/adapters/figma.ts";
import { createGitlab } from "../../src/adapters/gitlab.ts";
import { createJira } from "../../src/adapters/jira.ts";
import { createSlack } from "../../src/adapters/slack.ts";
import { testChat, testDesign, testForge, testTracker } from "../../src/app/connections.ts";
import { type FakeGitLab, type FakeJira, type FakeSlack, fakeFigma, fakeGitLab, fakeJira, fakeSlack } from "../fixtures/servers.ts";

let jira: FakeJira;
let gitlab: FakeGitLab;
let slack: FakeSlack;
let figma: Awaited<ReturnType<typeof fakeFigma>>;

beforeAll(async () => {
  [jira, gitlab, slack, figma] = await Promise.all([fakeJira([]), fakeGitLab(), fakeSlack(), fakeFigma()]);
});
afterAll(async () => {
  await Promise.all([jira.close(), gitlab.close(), slack.close(), figma.close()]);
});

describe("les connexions aux services", () => {
  it("disent a qui appartiennent les jetons acceptes", async () => {
    assert.equal((await testTracker(createJira({ site: jira.url, email: "moi@test", token: "jeton" }))).status, "ok");
    assert.deepEqual(await testForge(createGitlab({ host: gitlab.url, token: "jeton" })), { status: "ok", detail: "connecte en tant que @moi" });
    assert.deepEqual(await testChat(createSlack({ base: slack.url, token: "xoxp-jeton" }), "xoxp-jeton"), { status: "ok", detail: "connecte en tant que moi sur equipe" });
    assert.deepEqual(await testDesign(createFigma({ base: `${figma.url}/v1`, token: "jeton" })), { status: "ok", detail: "connecte en tant que moi" });
  });

  it("nomment les portees qui manquent au jeton GitLab, et previennent quand elles sont inconnues", async () => {
    const forge = createGitlab({ host: gitlab.url, token: "jeton" });
    gitlab.scopes = ["read_api"];
    assert.deepEqual(await testForge(forge), { status: "fail", detail: "@moi : portees manquantes api, write_repository" });
    gitlab.scopes = null;
    assert.equal((await testForge(forge)).status, "warn");
    gitlab.scopes = ["api", "write_repository"];
  });

  it("refusent un jeton Slack de bot, et nomment les portees qui manquent", async () => {
    const chat = createSlack({ base: slack.url, token: "xoxb-bot" });
    assert.match((await testChat(chat, "xoxb-bot")).detail, /jeton utilisateur xoxp-/);
    slack.scopes = ["chat:write"];
    assert.match((await testChat(createSlack({ base: slack.url, token: "xoxp-jeton" }), "xoxp-jeton")).detail, /portees manquantes groups:write, groups:write\.invites/);
  });

  it("disent refuse un jeton que le service ne reconnait pas", async () => {
    figma.accepted = false;
    assert.deepEqual(await testDesign(createFigma({ base: `${figma.url}/v1`, token: "faux" })), { status: "fail", detail: "identifiants refuses : verifie FIGMA_TOKEN" });
  });
});
