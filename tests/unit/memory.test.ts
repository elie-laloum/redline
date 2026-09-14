import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { after, before, describe, it } from "node:test";
import {
  type Frontmatter,
  SCOPE_DIRECTORIES,
  assertNoteLength,
  ensureMemoryLayout,
  listNotes,
  parseNote,
  queryNotes,
  serializeNote,
  writeNote,
} from "../../plugins/autopilot/mcp/lib/memory.ts";
import { sandboxHome } from "../helpers.ts";

const sandbox = sandboxHome();
const root = join(sandbox.home, "memory");

before(() => {
  ensureMemoryLayout(root);
  write("repos/web-app/conventions-tests.md", { type: "convention", scope: "repo", last_verified: "2026-09-13", repos: ["web-app"] }, "Le repo tourne sous rstest.\nPas de vitest.");
  write("repos/design-system/publication.md", { type: "piege", scope: "repo", last_verified: "2026-09-10", repos: ["design-system"] }, "La publication passe par un tag git.");
  write("features/sheet-lab/filtres.md", { type: "knowledge", scope: "feature", feature: "lab", last_verified: "2026-09-12", repos: ["web-app", "sheet-service"] }, "Un filtre par periode existe deja sur les annexes.");
  write("changes/FT-1025.md", { type: "knowledge", scope: "change", last_verified: "2026-09-15", source: { ticket: "FT-1025" } }, "Historique du ticket.");
});

after(() => sandbox.cleanup());

function write(path: string, frontmatter: Record<string, unknown>, body: string): void {
  const absolute = join(root, path);
  mkdirSync(join(absolute, ".."), { recursive: true });
  writeFileSync(absolute, serializeNote(frontmatter as unknown as Frontmatter, body), "utf8");
}

describe("frontmatter", () => {
  it("se relit apres serialisation", () => {
    const frontmatter = {
      type: "knowledge",
      scope: "feature",
      feature: "lab",
      last_verified: "2026-09-13",
      repos: ["web-app"],
      source: { ticket: "FT-1025" },
    } as unknown as Frontmatter;
    const note = parseNote("features/lab/x.md", serializeNote(frontmatter, "Corps."));
    assert.equal(note.frontmatter.scope, "feature");
    assert.equal(note.frontmatter.feature, "lab");
    assert.deepEqual(note.frontmatter.repos, ["web-app"]);
    assert.equal(note.body, "Corps.");
  });

  it("refuse une note sans frontmatter", () => {
    assert.throws(() => parseNote("repos/x.md", "juste du texte"), /sans frontmatter/);
  });

  it("refuse un scope inconnu", () => {
    const raw = "---\ntype: knowledge\nscope: inventé\nlast_verified: 2026-09-13\n---\n\nCorps.";
    assert.throws(() => parseNote("repos/x.md", raw), /Scope inconnu/);
  });

  it("refuse une date mal formee", () => {
    const raw = "---\ntype: knowledge\nscope: repo\nlast_verified: hier\n---\n\nCorps.";
    assert.throws(() => parseNote("repos/x.md", raw), /last_verified/);
  });

  it("refuse une note rangee dans le mauvais dossier", () => {
    const raw = "---\ntype: knowledge\nscope: feature\nlast_verified: 2026-09-13\n---\n\nCorps.";
    assert.throws(() => parseNote("repos/web-app/x.md", raw), /rangee sous/);
  });

  it("fait correspondre chaque scope a un dossier", () => {
    assert.equal(SCOPE_DIRECTORIES.repo, "repos");
    assert.equal(SCOPE_DIRECTORIES.change, "changes");
    assert.equal(SCOPE_DIRECTORIES.company, "company");
  });
});

describe("limite de longueur", () => {
  it("laisse passer une note courte", () => {
    assert.doesNotThrow(() => assertNoteLength("repos/x.md", "une ligne\nune autre"));
  });

  it("refuse une note au-dela de la limite, pour qu'on la scinde", () => {
    const long = Array.from({ length: 101 }, (_, index) => `ligne ${index}`).join("\n");
    assert.throws(() => assertNoteLength("repos/x.md", long), /trop longue/);
  });

  it("refuse aussi a l'ecriture", () => {
    const long = Array.from({ length: 150 }, () => "ligne").join("\n");
    assert.throws(
      () => writeNote("repos/web-app/trop-long.md", { type: "knowledge", scope: "repo", last_verified: "2026-09-13" } as Frontmatter, long, root),
      /trop longue/,
    );
  });
});

describe("filtre deterministe", () => {
  it("lit toutes les notes", () => {
    assert.equal(listNotes(root).length, 4);
  });

  it("filtre par scope", () => {
    const notes = queryNotes({ scope: "repo" }, root);
    assert.deepEqual(notes.map((note) => note.path).sort(), [
      "repos/design-system/publication.md",
      "repos/web-app/conventions-tests.md",
    ]);
  });

  it("filtre par repo declare", () => {
    const notes = queryNotes({ repos: ["sheet-service"] }, root);
    assert.deepEqual(notes.map((note) => note.path), ["features/sheet-lab/filtres.md"]);
  });

  it("filtre par feature", () => {
    assert.equal(queryNotes({ feature: "lab" }, root).length, 1);
    assert.equal(queryNotes({ feature: "inexistante" }, root).length, 0);
  });

  it("filtre par prefixe de chemin, ce dont se sert la passe ciblee du doc-scout", () => {
    assert.deepEqual(
      queryNotes({ pathPrefix: "repos/web-app/" }, root).map((note) => note.path),
      ["repos/web-app/conventions-tests.md"],
    );
  });

  it("grep le contenu, insensible a la casse", () => {
    assert.equal(queryNotes({ grep: "RSTEST" }, root).length, 1);
    assert.equal(queryNotes({ grep: "jamais ecrit nulle part" }, root).length, 0);
  });

  it("combine les filtres", () => {
    assert.equal(queryNotes({ scope: "repo", grep: "tag git" }, root).length, 1);
    assert.equal(queryNotes({ scope: "feature", grep: "tag git" }, root).length, 0);
  });

  it("respecte la limite, ce qui borne le budget du doc-scout", () => {
    assert.equal(queryNotes({ limit: 2 }, root).length, 2);
  });
});
