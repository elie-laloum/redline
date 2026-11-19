import assert from "node:assert/strict";
import { describe, it } from "bun:test";
import { reopenAfterEscalation } from "../../src/app/driver.ts";
import { newLedger } from "../../src/app/ledger.ts";
import { clearNotes, notesOf } from "../../src/app/notes.ts";
import { escalationFooter } from "../../src/cli/report.ts";
import { proofTechniqueWords } from "../../src/domain/arbitrage-scope.ts";
import { earlierEscalations } from "../../src/domain/escalation.ts";
import { invocation } from "../../src/domain/invocation.ts";
import { ruledLines, uncoverableDetail, uncoverableLines } from "../../src/domain/rulings.ts";
import { citedFile, trendNote } from "../../src/domain/trend.ts";
import { exampleSettings } from "../helpers.ts";

describe("les commandes que redline suggere", () => {
  it("nomment redline une fois installe, et bun redline depuis un clone", () => {
    assert.equal(invocation({}), "redline");
    assert.equal(invocation({ npm_lifecycle_event: "redline" }), "bun redline");
    assert.equal(invocation({ npm_lifecycle_event: "test" }), "redline");
  });
});

describe("le pied d'une escalade", () => {
  const history = [
    { event: "run ouvert" },
    { event: "escalade arbitrage sur core.tests" },
    { event: "reprise de la livraison avec un budget neuf" },
    { event: "escalade convergence sur app.code/adversaire" },
    { event: "escalade arbitrage sur core.tests" },
    { event: "escalade convergence sur core.tests/adversaire" },
  ];

  it("compte les escalades precedentes de la meme tache, gate comprise", () => {
    assert.deepEqual(earlierEscalations(history, "core.tests/adversaire"), ["arbitrage", "arbitrage"]);
    assert.deepEqual(earlierEscalations(history.slice(0, 2), "core.tests"), []);
  });

  it("dit le rang de l'escalade, propose la reprise a la main a partir de la troisieme, et nomme le journal", () => {
    const escalation = { kind: "convergence" as const, task: "core.tests/adversaire", detail: "budget epuise", at: "2026-11-19" };
    const footer = escalationFooter("FT-1", { status: "escalated", escalation, earlier: ["arbitrage", "arbitrage"], journal: "/home/.redline/runs/FT-1/events.jsonl" });
    assert.match(footer, /^3e escalade sur core\.tests — les precedentes : arbitrage, arbitrage\.\n/);
    assert.match(footer, /reprendre la branche a la main/);
    assert.match(footer, /Journal complet, verdicts non tronques : \/home\/\.redline\/runs\/FT-1\/events\.jsonl$/);

    const first = escalationFooter("FT-1", { status: "escalated", escalation });
    assert.doesNotMatch(first, /escalade sur|a la main|Journal/);
  });
});

describe("les arbitrages rendus sur des lignes non couvrables", () => {
  const lines = [{ id: "T15", reason: "PGlite ne sert qu'une connexion" }];

  it("se relisent depuis le detail de l'escalade qui les a declares", () => {
    assert.deepEqual(uncoverableLines(uncoverableDetail(lines)), lines);
    assert.deepEqual(uncoverableLines("budget de 3 tour(s) epuise"), []);
  });

  it("sont consignes quand l'humain reprend l'escalade avec une note, et seulement alors", () => {
    const base = newLedger({ key: "FT-1", squad: "FT", title: "Titre", url: "https://jira/FT-1", notes: null, figmaOverrides: [], budgets: exampleSettings().budgets });
    const escalated = { ...base, phase: "escalated" as const, resumePhase: "delivery" as const, escalation: { kind: "arbitrage" as const, task: "core.tests", detail: uncoverableDetail(lines), at: "2026-11-19" } };

    const ruled = reopenAfterEscalation(escalated, { note: "Le verrou se relit en revue." });
    assert.deepEqual(ruled.delivery.rulings.map((entry) => [entry.task, entry.lines.map((line) => line.id), entry.ruling]), [["core.tests", ["T15"], "Le verrou se relit en revue."]]);
    assert.deepEqual([...ruledLines(ruled.delivery.rulings, "core.tests")], ["T15"]);
    assert.deepEqual([...ruledLines(ruled.delivery.rulings, "app.tests")], []);

    assert.deepEqual(reopenAfterEscalation(escalated, { note: null }).delivery.rulings, []);
    const convergence = { ...escalated, escalation: { ...escalated.escalation, kind: "convergence" as const, task: "core.tests/adversaire" } };
    assert.deepEqual(reopenAfterEscalation(convergence, { note: "Allege l'assertion." }).delivery.rulings, []);
  });
});

describe("le dernier retour d'un adversaire", () => {
  it("distingue une convergence lente d'un adversaire sans point d'arret", () => {
    const slow = trendNote([{ count: 5, files: ["a.ts"] }, { count: 3, files: ["b.ts"] }, { count: 1, files: ["c.ts"] }]);
    assert.equal(slow, "Constats par tour : 5 → 3 → 1. Ils decroissent : convergence lente, un tour de plus suffirait sans doute.");
    const endless = trendNote([{ count: 2, files: [] }, { count: 3, files: [] }]);
    assert.match(endless, /^Constats par tour : 2 → 3\. Ils ne decroissent pas : l'adversaire n'a pas de point d'arret/);
    assert.equal(trendNote([{ count: 2, files: [] }]), "");
  });

  it("nomme le fichier cite a chacun des trois derniers tours", () => {
    const note = trendNote([
      { count: 2, files: ["tests/lock.test.ts", "a.ts"] },
      { count: 2, files: ["tests/lock.test.ts"] },
      { count: 2, files: ["b.ts", "tests/lock.test.ts"] },
    ]);
    assert.match(note, /\ntests\/lock\.test\.ts est cite a chacun des 3 derniers tours/);
    assert.doesNotMatch(note, /a\.ts est cite|b\.ts est cite/);
  });

  it("lit le fichier d'une citation", () => {
    assert.deepEqual(["src/x.ts:12", "src/x.ts:12:4", "src/x.ts:3-9", "src/x.ts"].map(citedFile), ["src/x.ts", "src/x.ts", "src/x.ts", "src/x.ts"]);
  });
});

describe("les notes de reprise", () => {
  const base = newLedger({ key: "FT-1", squad: "FT", title: "Titre", url: "https://jira/FT-1", notes: null, figmaOverrides: [], budgets: exampleSettings().budgets });
  const noted = { ...base, delivery: { ...base.delivery, seeds: { "core.tests": "Garde clamp.", "core.code": "Pas de nouvelle dependance." } } };

  it("se lisent par tache", () => {
    assert.deepEqual(notesOf(noted), [
      { task: "core.tests", note: "Garde clamp." },
      { task: "core.code", note: "Pas de nouvelle dependance." },
    ]);
  });

  it("s'effacent une a une ou toutes, en retirant la cle plutot qu'en ecrivant null", () => {
    const one = clearNotes(noted, "core.tests");
    assert.deepEqual(one.delivery.seeds, { "core.code": "Pas de nouvelle dependance." });
    assert.equal(one.history.at(-1)?.event, "note effacee sur core.tests");
    assert.deepEqual(clearNotes(noted, null).delivery.seeds, {});
    assert.throws(() => clearNotes(noted, "app.tests"), /Aucune note sur app\.tests/);
  });

  it("ne se touchent pas pendant qu'un run tourne", () => {
    assert.throws(() => clearNotes({ ...noted, active: { runId: "FT-1/delivery/2", pid: 42 } }, null), /en cours \(pid 42\)/);
  });
});

describe("les arbitrages", () => {
  it("signalent une note qui prescrit une technique de preuve plutot qu'un perimetre", () => {
    assert.deepEqual(proofTechniqueWords("Prouve la structure du verrou dans la trace SQL, via un trigger plpgsql."), ["trace sql", "trigger", "plpgsql"]);
    assert.deepEqual(proofTechniqueWords("Le verrou est hors de ce que les tests prouvent : il se relit en revue."), []);
  });
});
