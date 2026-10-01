import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, describe, it } from "bun:test";
import { pathsOf } from "../../src/app/paths.ts";
import { readSetup } from "../../src/app/setup.ts";
import { nextIncomplete, type Probes, SECTIONS, type SectionId, type SectionStatus, sectionStatus } from "../../src/cli/setup/sections.ts";
import { oauthTokenIn } from "../../src/cli/tui/handoff.ts";
import { temporaryDirectory } from "../helpers.ts";

const directory = temporaryDirectory("redline-ecran-init-");
afterAll(() => directory.cleanup());

const NONE: Probes = { connections: {}, image: null, check: null };

function home(name: string, files: Record<string, string>) {
  const paths = pathsOf(join(directory.path, name));
  mkdirSync(paths.home, { recursive: true });
  for (const [file, text] of Object.entries(files)) writeFileSync(join(paths.home, file), text);
  return readSetup(paths, {});
}

const statuses = (snapshot: ReturnType<typeof home>, probes: Probes = NONE) => Object.fromEntries(SECTIONS.map((id) => [id, sectionStatus(id, snapshot, probes)])) as Record<SectionId, SectionStatus>;

describe("les sections de init", () => {
  it("disent ce qui manque dans un home vide, et ouvrent sur la premiere section a remplir", () => {
    const all = statuses(home("vide", {}));
    assert.deepEqual([all.jira.state, all.slack.state, all.registry.state, all.settings.state, all.voice.state], ["missing", "missing", "missing", "default", "default"]);
    assert.equal(all.jira.detail, "JIRA_SITE_URL, JIRA_EMAIL, JIRA_API_TOKEN a renseigner");
    assert.equal(nextIncomplete(all, null), "jira");
    assert.equal(nextIncomplete(all, "jira"), "gitlab");
  });

  it("tiennent compte de la reponse des services et de ceux qui sont coupes", () => {
    const snapshot = home("coupe", { ".env": "SLACK_USER_TOKEN=xoxp-1\nGITLAB_TOKEN=glpat\n", "redline.yaml": "schemaVersion: 2\nservices:\n  figma: false\n" });
    const all = statuses(snapshot, { connections: { slack: { status: "fail", detail: "portees manquantes chat:write" }, gitlab: "pending" }, image: { state: "absent", detail: "absente" }, check: null });
    assert.deepEqual([all.figma.state, all.slack.state, all.gitlab.state, all.image.state, all.services.detail], ["off", "failing", "pending", "missing", "desactives : Figma"]);
  });

  it("montrent l'erreur d'un fichier invalide dans sa section, sans perdre les autres", () => {
    const snapshot = home("invalide", { "redline.yaml": "schemaVersion: 2\nbudgets: { testAdversary: 0 }\n", "repositories.yaml": "schemaVersion: 1\nrepositories: []\n" });
    const all = statuses(snapshot);
    assert.equal(all.settings.state, "failing");
    assert.match(all.settings.detail, /redline\.yaml invalide/);
    assert.equal(all.registry.state, "missing");
  });
});

describe("le jeton de claude setup-token", () => {
  it("se lit dans la sortie du terminal, couleurs et deplacements du curseur compris", () => {
    const token = `sk-ant-oat01-${"a1B2_c3-".repeat(12)}`;
    assert.equal(oauthTokenIn(`\x1b[2K\x1b[1GYour OAuth token:\r\n\x1b[32m${token}\x1b[39m\r\n\x1b]8;;https://x\x07lien\x1b]8;;\x07`), token);
    assert.equal(oauthTokenIn("Error: login cancelled"), null);
  });
});
