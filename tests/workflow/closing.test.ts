import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, it } from "bun:test";
import type { Script } from "../kit/agents.ts";
import { approved, close, codePass, codeReply, deliver, IMPLEMENTATION, memoryReply, proseReply, testsPhase } from "../kit/delivery.ts";
import { ISSUE } from "../kit/framing.ts";
import { createWorld, type World } from "../kit/world.ts";

let world: World | null = null;
afterEach(async () => {
  await world?.cleanup();
  world = null;
});

const git = (cwd: string, ...args: string[]) => execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
const delivery = { ...testsPhase, developer: [{ writes: { "src/period.js": IMPLEMENTATION }, reply: codeReply() }], "code-adversary": [{ reply: codePass(["C1"]) }] };
const USERS = { "first.dev@example.com": "U1" };
/** The package invites nobody by default: this squad's allowlist is declared here. */
const INVITEES = (template: string) => template.replace(/ {4}bySquad: \{\}( +# par exemple :)/, "    bySquad:\n      FT: [first.dev@example.com, second.dev@example.com]");

async function delivered(world: World, notes: string | null = null) {
  const ledger = world.ledger("FT-1", { notes });
  const framing = approved(world);
  const { result, outcome } = await deliver(world, ledger, framing);
  result.unwrap();
  return { ledger, framing, repos: outcome ?? [] };
}

describe("la cloture", () => {
  it("capitalise en un seul commit memoire, puis publie MR, canal et ticket", async () => {
    world = await createWorld({
      issues: [ISSUE],
      slackUsers: USERS,
      settings: INVITEES,
      script: { ...delivery, "memory-planner": [{ reply: memoryReply }], finalizer: [{ reply: proseReply(["fixture-core"]) }] } as Script,
    });
    const { ledger, framing, repos } = await delivered(world);
    const { result, outcome } = await close(world, ledger, framing, repos);
    result.unwrap();

    const home = world.app.paths.home;
    assert.equal(git(home, "log", "--format=%s", "-1"), "memory: FT-1");
    assert.ok(existsSync(join(world.app.paths.memory, "features/periode/filtre.md")));
    const mr = world.gitlab.mergeRequests[0];
    assert.equal(world.gitlab.mergeRequests.length, 1);
    assert.equal(mr?.title, "Draft: feature/FT-1: Filtrer la liste par periode");
    assert.match(mr?.description ?? "", /## Ce que fait ce changement\nLe repo fixture-core filtre par periode\.[\s\S]*Mois en cours[\s\S]*Refs: FT-1/);
    const channel = world.slack.channels[0];
    assert.deepEqual([channel?.name, channel?.isPrivate], ["ft-1-filtrer-la-liste-par-periode", true]);
    assert.deepEqual(world.slack.invited, [{ channel: channel?.id, users: ["U1"] }]);
    assert.deepEqual(outcome?.slack?.unknown, ["second.dev@example.com"]);
    assert.match(world.slack.messages[0]?.text ?? "", new RegExp(`fixture-core : ${mr?.url}`));
    assert.equal(world.slack.bookmarks.length, 2);
    assert.deepEqual(world.jira.transitions, [{ key: "FT-1", to: "VALIDATION" }]);
    assert.equal(world.jira.comments.length, 1);
    const coreRepo = world.repos.find((repo) => repo.name === "fixture-core")?.path ?? "";
    assert.match(git(coreRepo, "ls-remote", "--heads", "origin"), /feature\/FT-1-filtrer-la-liste-par-periode/);
  });

  it("ne publie ni sur Slack ni sur le ticket quand ces services sont coupes, et ne fait pas ecrire leurs textes", async () => {
    world = await createWorld({
      issues: [ISSUE],
      slackUsers: USERS,
      settings: (template) => template.replace("slack: true ", "slack: false").replace("jiraWrites: true ", "jiraWrites: false"),
      script: { ...delivery, "memory-planner": [{ reply: memoryReply }], finalizer: [{ reply: { ...proseReply(["fixture-core"]), slack: "", jira: "" } }] } as Script,
    });
    const { ledger, framing, repos } = await delivered(world);
    const { result, outcome } = await close(world, ledger, framing, repos);
    result.unwrap();

    assert.equal(world.gitlab.mergeRequests.length, 1);
    assert.equal(outcome?.slack, null);
    assert.deepEqual(outcome?.jira, { transition: null, commented: false });
    assert.deepEqual([world.slack.channels.length, world.slack.messages.length, world.jira.transitions.length, world.jira.comments.length], [0, 0, 0, 0]);
    assert.match(world.agents.prompts.finalizer?.[0] ?? "", /une chaine vide : Slack est desactive/);
  });

  it("transmet les notes du lancement a chaque agent de la livraison et de la cloture", async () => {
    world = await createWorld({
      issues: [ISSUE],
      slackUsers: USERS,
      settings: INVITEES,
      script: { ...delivery, "memory-planner": [{ reply: memoryReply }], finalizer: [{ reply: proseReply(["fixture-core"]) }] } as Script,
    });
    const { ledger, framing, repos } = await delivered(world, "Garder le format de date ISO.");
    (await close(world, ledger, framing, repos)).result.unwrap();

    for (const role of ["test-writer", "test-adversary", "red-checker", "developer", "code-adversary", "memory-planner", "finalizer"] as const) {
      assert.match(world.agents.prompts[role]?.[0] ?? "", /Notes de l'humain au lancement : Garder le format de date ISO\./, role);
    }
  });

  it("refuse un texte qui mentionne l'outil et fait reecrire le redacteur", async () => {
    world = await createWorld({
      issues: [ISSUE],
      script: { ...delivery, "memory-planner": [{ reply: memoryReply }], finalizer: [{ reply: proseReply(["fixture-core"], "ping @autopilot c'est pret") }, { reply: proseReply(["fixture-core"]) }] } as Script,
    });
    const { ledger, framing, repos } = await delivered(world);
    const { result } = await close(world, ledger, framing, repos);
    result.unwrap();
    assert.match(world.agents.prompts.finalizer?.[1] ?? "", /mention interdite/);
    assert.doesNotMatch(world.slack.messages[0]?.text ?? "", /@autopilot/);
  });

  it("fait traiter les contradictions et refuse un plan memoire qui ne s'applique pas", async () => {
    world = await createWorld({
      issues: [ISSUE],
      script: {
        ...delivery,
        "memory-planner": [{ reply: { operations: [{ action: "delete", path: "repos/fantome.md", why: "?" }], decisions: [] } }, { reply: { ...memoryReply, decisions: [{ note: "repos/fixture-core/tests.md", decision: "supprimer", why: "le repo n'utilise pas vitest" }] } }],
        finalizer: [{ reply: proseReply(["fixture-core"]) }],
      } as Script,
    });
    const { ledger, framing, repos } = await delivered(world);
    const contradicted = { ...framing, contradictions: [{ note: "repos/fixture-core/tests.md", claim: "les tests tournent sous vitest", evidence: "package.json:4 — node --test", raisedBy: "scope-scout/fixture-core" }] };
    const { result } = await close(world, ledger, contradicted, repos);
    result.unwrap();
    assert.match(world.agents.prompts["memory-planner"]?.[0] ?? "", /tourn\w+ sous vitest/);
    const retry = world.agents.prompts["memory-planner"]?.[1] ?? "";
    assert.match(retry, /repos\/fantome\.md n'existe pas/);
    assert.match(retry, /contradiction sur repos\/fixture-core\/tests\.md n'a pas de decision/);
  });

  it("ne duplique rien quand la publication est rejouee", async () => {
    world = await createWorld({ issues: [ISSUE], slackUsers: USERS, script: { ...delivery, "memory-planner": [{ reply: memoryReply }], finalizer: [{ reply: proseReply(["fixture-core"]) }] } as Script });
    const { ledger, framing, repos } = await delivered(world);
    (await close(world, ledger, framing, repos)).result.unwrap();
    const again = await close(world, { ...ledger, closing: { attempt: 2 } }, framing, repos);
    again.result.unwrap();
    assert.equal(world.gitlab.mergeRequests.length, 1);
    assert.equal(world.slack.messages.length, 1);
    assert.equal(world.slack.bookmarks.length, 2);
    assert.equal(world.jira.comments.length, 1);
    assert.equal(world.jira.transitions.length, 1);
  });
});
