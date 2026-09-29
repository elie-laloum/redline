import assert from "node:assert/strict";
import { afterAll, beforeAll, describe, it } from "bun:test";
import { createMemoryStore, serializeNote } from "../../src/adapters/memory-store.ts";
import { type Frontmatter, lengthProblem, parseNote, queryNotes, SCOPE_DIRECTORIES } from "../../src/domain/memory.ts";
import { temporaryDirectory } from "../helpers.ts";

const directory = temporaryDirectory();
const store = createMemoryStore(directory.path, 100);
const note = (fields: Record<string, unknown>) => fields as unknown as Frontmatter;

beforeAll(() => {
  store.ensureLayout();
  store.write("repos/web-app/conventions-tests.md", note({ type: "convention", scope: "repo", last_verified: "2026-09-13", repos: ["web-app"] }), "Le repo tourne sous rstest.\nPas de vitest.");
  store.write("repos/design-system/publication.md", note({ type: "piege", scope: "repo", last_verified: "2026-09-10", repos: ["design-system"] }), "La publication passe par un tag git.");
  store.write("features/sheet-lab/filtres.md", note({ type: "knowledge", scope: "feature", feature: "lab", last_verified: "2026-09-12", repos: ["web-app", "sheet-service"] }), "Un filtre par periode existe deja sur les annexes.");
  store.write("changes/FT-1025.md", note({ type: "knowledge", scope: "change", last_verified: "2026-09-15", source: { ticket: "FT-1025" } }), "Historique du ticket.");
});

afterAll(() => directory.cleanup());

describe("frontmatter", () => {
  it("se relit apres serialisation", () => {
    const parsed = parseNote("features/lab/x.md", serializeNote(note({ type: "knowledge", scope: "feature", feature: "lab", last_verified: "2026-09-13", repos: ["web-app"] }), "Corps."));
    assert.equal(parsed.frontmatter.feature, "lab");
    assert.deepEqual(parsed.frontmatter.repos, ["web-app"]);
    assert.equal(parsed.body, "Corps.");
  });

  it("refuse une note sans frontmatter, un scope inconnu, une date mal formee, un mauvais dossier", () => {
    assert.throws(() => parseNote("repos/x.md", "juste du texte"), /sans frontmatter/);
    assert.throws(() => parseNote("repos/x.md", "---\ntype: k\nscope: invente\nlast_verified: 2026-09-13\n---\n\nC."), /scope inconnu/);
    assert.throws(() => parseNote("repos/x.md", "---\ntype: k\nscope: repo\nlast_verified: hier\n---\n\nC."), /last_verified/);
    assert.throws(() => parseNote("repos/web-app/x.md", "---\ntype: k\nscope: feature\nlast_verified: 2026-09-13\n---\n\nC."), /rangee sous repos/);
  });

  it("fait correspondre chaque scope a un dossier", () => {
    assert.equal(SCOPE_DIRECTORIES.repo, "repos");
    assert.equal(SCOPE_DIRECTORIES.change, "changes");
  });
});

describe("limite de longueur", () => {
  it("laisse passer une note courte et refuse une note trop longue", () => {
    assert.equal(lengthProblem("une\ndeux", 100), null);
    assert.match(lengthProblem(Array.from({ length: 101 }, (_, i) => `l${i}`).join("\n"), 100) ?? "", /scinder/);
  });

  it("refuse aussi a l'ecriture", () => {
    const long = Array.from({ length: 150 }, () => "ligne").join("\n");
    assert.throws(() => store.write("repos/web-app/long.md", note({ type: "k", scope: "repo", last_verified: "2026-09-13" }), long), /scinder/);
  });

  it("refuse un chemin qui sort de la memoire", () => {
    assert.throws(() => store.write("../evasion.md", note({ type: "k", scope: "repo", last_verified: "2026-09-13" }), "x"));
  });
});

describe("filtre deterministe", () => {
  const notes = () => store.list();

  it("lit toutes les notes", () => {
    assert.equal(notes().length, 4);
  });

  it("filtre par scope, repo, feature, prefixe, grep et limite", () => {
    assert.deepEqual(queryNotes(notes(), { scope: "repo" }).map((n) => n.path), ["repos/design-system/publication.md", "repos/web-app/conventions-tests.md"]);
    assert.deepEqual(queryNotes(notes(), { repos: ["sheet-service"] }).map((n) => n.path), ["features/sheet-lab/filtres.md"]);
    assert.equal(queryNotes(notes(), { feature: "lab" }).length, 1);
    assert.deepEqual(queryNotes(notes(), { pathPrefix: "repos/web-app/" }).map((n) => n.path), ["repos/web-app/conventions-tests.md"]);
    assert.equal(queryNotes(notes(), { grep: "RSTEST" }).length, 1);
    assert.equal(queryNotes(notes(), { scope: "feature", grep: "tag git" }).length, 0);
    assert.equal(queryNotes(notes(), { limit: 2 }).length, 2);
  });
});
