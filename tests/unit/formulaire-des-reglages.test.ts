import assert from "node:assert/strict";
import { describe, it } from "bun:test";
import { overlay } from "../../src/app/settings.ts";
import { formatValue, parseInput, seedFor, settingRows } from "../../src/cli/setup/fields.ts";
import { SettingsSchema } from "../../src/domain/config.ts";
import { exampleSettings } from "../helpers.ts";

const defaults = exampleSettings();
const overrides = { budgets: { testAdversary: 5 }, agents: { byRole: { planner: { model: "opus", reasoning: "high" } } } };
const merged = overlay(defaults, overrides);
const SKIP = [["schemaVersion"], ["services"], ["memory", "repository"], ["memory", "path"], ["agents", "authentication"]];
const rows = settingRows(SettingsSchema, merged, defaults, overrides, SKIP);
const field = (path: string) => rows.find((row) => row.type === "field" && row.path.join(".") === path);

describe("le formulaire des reglages", () => {
  it("donne a chaque cle son champ, avec sa valeur, son defaut et sa surcharge", () => {
    const budget = field("budgets.testAdversary");
    assert.ok(budget?.type === "field");
    assert.deepEqual([budget.input, budget.value, budget.fallback, budget.overridden], [{ kind: "number", integer: true, min: 1 }, 5, 3, true]);
    assert.ok(field("budgets.redChecker")?.type === "field" && !(field("budgets.redChecker") as { overridden: boolean }).overridden);
    assert.deepEqual((field("agents.default.reasoning") as { input: unknown; optional: boolean }).optional, true);
    assert.deepEqual((field("slack.channelVisibility") as { input: unknown }).input, { kind: "choice", options: ["private", "public"] });
    assert.deepEqual((field("naming.types") as { input: unknown }).input, { kind: "list" });
  });

  it("laisse aux autres sections ce qui leur revient", () => {
    for (const path of ["services.slack", "memory.repository", "agents.authentication", "schemaVersion"]) assert.equal(field(path), undefined, path);
    assert.ok(field("memory.maxNoteLines"));
  });

  it("propose d'ajouter une cle aux tables, parmi les roles qui n'en ont pas encore", () => {
    const roles = rows.find((row) => row.type === "entry" && row.path.join(".") === "agents.byRole");
    assert.ok(roles?.type === "entry" && roles.keys?.includes("scope-scout") && !roles.keys.includes("planner"));
    const squads = rows.find((row) => row.type === "entry" && row.path.join(".") === "slack.invitees.bySquad");
    assert.ok(squads?.type === "entry" && squads.keys === null);
    assert.deepEqual(seedFor(["slack", "invitees", "bySquad"], merged), []);
    assert.deepEqual(seedFor(["agents", "byRole"], merged), defaults.agents.default);
    assert.equal(seedFor(["naming", "typeFromJiraIssueType"], merged), "task");
  });

  it("lit ce qui est tape selon le type du champ", () => {
    assert.deepEqual(parseInput({ kind: "number", integer: true, min: 1 }, "0", false), { error: "au moins 1" });
    assert.deepEqual(parseInput({ kind: "number", integer: false, min: 0.5 }, "1,5", true), { value: 1.5 });
    assert.deepEqual(parseInput({ kind: "number", integer: false, min: 0.5 }, "", true), { value: undefined });
    assert.deepEqual(parseInput({ kind: "list" }, "a@x.fr, b@x.fr,", false), { value: ["a@x.fr", "b@x.fr"] });
    assert.deepEqual(parseInput({ kind: "choice", options: ["private", "public"] }, "secret", false), { error: "une valeur parmi : private, public" });
    assert.equal(formatValue(["a", "b"]), "a, b");
  });
});
