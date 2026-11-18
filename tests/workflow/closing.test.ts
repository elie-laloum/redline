import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, it } from "bun:test";
import type { Script } from "../kit/agents.ts";
import { approved, close, codePass, codeReply, conformityPass, deliver, IMPLEMENTATION, memoryReply, proseReply, testsPhase } from "../kit/delivery.ts";
import { ISSUE } from "../kit/framing.ts";
import { createWorld, type World } from "../kit/world.ts";
import { temporaryDirectory } from "../helpers.ts";

let world: World | null = null;
afterEach(async () => {
  await world?.cleanup();
  world = null;
});

const git = (cwd: string, ...args: string[]) => execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
const delivery = {
  ...testsPhase,
  developer: [{ writes: { "src/period.js": IMPLEMENTATION }, reply: codeReply() }],
  "code-adversary": [{ reply: codePass(["C1"]) }],
  "conformity-checker": [{ reply: conformityPass(["F1"], ["T1", "C1"]) }],
};
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

  it("garde la fiche Jira quand le developpeur a repondu au cadrage, et annonce les divergences en attente du PO", async () => {
    world = await createWorld({
      issues: [ISSUE],
      slackUsers: USERS,
      script: { ...delivery, "memory-planner": [{ reply: memoryReply }], finalizer: [{ reply: proseReply(["fixture-core"]) }] } as Script,
    });
    const { ledger, framing, repos } = await delivered(world);
    const divergence = { said: "La liste s'ouvre sur toutes les feuilles.", decided: "La liste s'ouvre sur le mois en cours.", why: "trop long a charger" };
    const edited = { ...framing, functional: { ...framing.functional, divergences: [divergence], edits: [{ before: "La liste des feuilles", after: "La liste du mois" }], respondent: "developer" as const } };
    const { result, outcome } = await close(world, ledger, edited, repos, { answers: ["Encore ouvert"] });
    result.unwrap();

    assert.match(
      world.gitlab.mergeRequests[0]?.description ?? "",
      /## Divergences avec l'US \(en attente de validation du PO\)\n- L'US dit : La liste s'ouvre sur toutes les feuilles\. → decide : La liste s'ouvre sur le mois en cours\. \(trop long a charger\)/,
    );
    assert.deepEqual(world.jira.descriptions, []);
    assert.deepEqual(outcome?.jira.edits, { applied: 0, missed: [] });
  });

  it("reprend chaque point ouvert avec l'humain, et livre avec reserves tant qu'il en reste", async () => {
    world = await createWorld({
      issues: [ISSUE],
      slackUsers: USERS,
      script: { ...delivery, "memory-planner": [{ reply: memoryReply }], finalizer: [{ reply: proseReply(["fixture-core"]) }] } as Script,
    });
    const { ledger, framing, repos } = await delivered(world);
    const points = [
      { id: "P1", text: "Qui supprime la route de report ?" },
      { id: "P2", text: "Le redatage de l'import est-il garde ?" },
      { id: "P3", text: "Faut-il un export CSV ?" },
    ];
    const withPoints = { ...framing, plan: { ...framing.plan, openPoints: points } };
    const { result, outcome, asked } = await close(world, ledger, withPoints, repos, {
      answers: ["Tranche", "Encore ouvert", "Reporte hors du perimetre", "Le back la supprime au sprint suivant."],
    });
    result.unwrap();

    assert.deepEqual(
      asked.map((question) => question.split("\n")[0]),
      ["Points ouverts · 1/3 — Point ouvert P1", "Points ouverts · 2/3 — Point ouvert P2", "Points ouverts · 3/3 — Point ouvert P3", "Points ouverts · 4/4 — Decision sur P1"],
    );
    const mr = world.gitlab.mergeRequests[0]?.description ?? "";
    assert.match(mr, /^## Points encore ouverts\n- P2 Le redatage de l'import est-il garde \?\n\n## Ce que fait ce changement/);
    assert.match(mr, /## Arbitrages\n[\s\S]*Points ouverts tranches a la cloture :\n- P1 Qui supprime la route de report \? → Le back la supprime au sprint suivant\.\n\n## Points reportes hors du perimetre\n- P3 Faut-il un export CSV \?\n/);
    const finalizer = world.agents.prompts.finalizer?.[0] ?? "";
    assert.match(finalizer, /Encore ouverts :\n\n- P2 Le redatage de l'import est-il garde \?/);
    assert.deepEqual(world.jira.transitions, []);
    assert.equal(world.jira.comments.length, 1);
    assert.deepEqual(outcome?.jira.transition, null);
    assert.deepEqual(outcome?.openPoints.map((point) => [point.id, point.status, point.decision]), [
      ["P1", "settled", "Le back la supprime au sprint suivant."],
      ["P2", "open", null],
      ["P3", "deferred", null],
    ]);
  });

  it("repose les divergences en attente du PO comme points ouverts, et deplace le ticket une fois tout tranche", async () => {
    world = await createWorld({
      issues: [ISSUE],
      slackUsers: USERS,
      script: { ...delivery, "memory-planner": [{ reply: memoryReply }], finalizer: [{ reply: proseReply(["fixture-core"]) }] } as Script,
    });
    const { ledger, framing, repos } = await delivered(world);
    const divergence = { said: "La liste s'ouvre sur toutes les feuilles.", decided: "La liste s'ouvre sur le mois en cours.", why: "trop long a charger" };
    const edited = { ...framing, functional: { ...framing.functional, divergences: [divergence], respondent: "developer" as const } };
    const { result, outcome, asked } = await close(world, ledger, edited, repos, { answers: ["Tranche", "Valide par le PO en daily."] });
    result.unwrap();

    assert.match(asked[0] ?? "", /Point ouvert D1\n\nA valider par le PO : l'US dit « La liste s'ouvre sur toutes les feuilles\. »/);
    assert.deepEqual(outcome?.openPoints.map((point) => [point.id, point.status]), [["D1", "settled"]]);
    assert.deepEqual(world.jira.transitions, [{ key: "FT-1", to: "VALIDATION" }]);
  });

  it("confronte le code livre au cadrage et met les ecarts en tete de la MR, sans rien renvoyer au developpeur", async () => {
    const gap = { decisions: [{ id: "F1", verdict: "ecart", evidence: "src/period.js:2", comment: "rend toujours 2026-09, pas le mois en cours" }], checklist: conformityPass([], ["T1", "C1"]).checklist };
    world = await createWorld({
      issues: [ISSUE],
      slackUsers: USERS,
      script: { ...delivery, "conformity-checker": [{ reply: gap }], "memory-planner": [{ reply: memoryReply }], finalizer: [{ reply: proseReply(["fixture-core"]) }] } as Script,
    });
    const { ledger, framing, repos } = await delivered(world);
    const { result, outcome } = await close(world, ledger, framing, repos);
    result.unwrap();

    const prompt = world.agents.prompts["conformity-checker"]?.[0] ?? "";
    assert.match(prompt, /- F1 : Periode par defaut \? → Mois en cours \(humain\)/);
    assert.match(prompt, /- T1 Sans periode, clamp rend le mois en cours\.\n- C1 Les appelants de clamp ne changent pas\./);
    assert.match(
      world.gitlab.mergeRequests[0]?.description ?? "",
      /^## Ecarts au cadrage constates a la cloture\n- F1 Periode par defaut \? → Mois en cours \(humain\) : rend toujours 2026-09, pas le mois en cours \(src\/period\.js:2\)\n\n## Ce que fait ce changement/,
    );
    assert.deepEqual(outcome?.conformity.map((report) => [report.repo, report.gaps.map((entry) => entry.id)]), [["fixture-core", ["F1"]]]);
    assert.deepEqual(world.jira.transitions, [{ key: "FT-1", to: "VALIDATION" }]);
    assert.deepEqual(world.agents.remaining(), {});
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
    assert.deepEqual(outcome?.jira, { transition: null, commented: false, edits: { applied: 0, missed: [] } });
    assert.deepEqual([world.slack.channels.length, world.slack.messages.length, world.jira.transitions.length, world.jira.comments.length], [0, 0, 0, 0]);
    assert.match(world.agents.prompts.finalizer?.[0] ?? "", /une chaine vide : Slack est desactive/);
  });

  it("ecrit la memoire dans son propre depot, sous l'identite de l'humain, et la pousse", async () => {
    const shared = temporaryDirectory("redline-memoire-partagee-");
    try {
      const remote = join(shared.path, "memoire.git");
      const clone = join(shared.path, "memoire");
      execFileSync("git", ["init", "-q", "--bare", "-b", "main", remote]);
      execFileSync("git", ["clone", "-q", remote, clone], { stdio: "ignore" });
      git(clone, "-c", "user.name=t", "-c", "user.email=t@x", "commit", "-q", "--allow-empty", "-m", "seed");
      git(clone, "push", "-q", "origin", "main");
      world = await createWorld({
        issues: [ISSUE],
        slackUsers: USERS,
        settings: (template) => `${INVITEES(template).replace(/ {2}path: null[^\n]*/, `  path: ${clone}`)}\ngit:\n  committer: { name: Ada, email: ada@x }\n`.replace(/\ngit: \{\}\n/, "\n"),
        script: { ...delivery, "memory-planner": [{ reply: memoryReply }], finalizer: [{ reply: proseReply(["fixture-core"]) }] } as Script,
      });
      const { ledger, framing, repos } = await delivered(world);
      const { result, outcome } = await close(world, ledger, framing, repos);
      result.unwrap();

      assert.equal(world.app.paths.memory, clone);
      assert.ok(existsSync(join(clone, "features/periode/filtre.md")));
      assert.equal(git(remote, "log", "-1", "--format=%an %s"), "Ada memory: FT-1");
      assert.equal(outcome?.memory.commit, git(clone, "rev-parse", "--short", "HEAD"));
      assert.equal(git(world.app.paths.home, "show", "--name-only", "--format=", "HEAD").includes("memory/"), false);
    } finally {
      shared.cleanup();
    }
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
