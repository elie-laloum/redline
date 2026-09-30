import assert from "node:assert/strict";
import { describe, it } from "bun:test";
import { buildCommitMessage } from "../../src/domain/commit-message.ts";
import { parseEvidence } from "../../src/domain/evidence.ts";
import { findFigmaUrls, frameFileName, parseFigmaUrl } from "../../src/domain/figma.ts";
import { publishableProblems } from "../../src/domain/voice.ts";
import { isTestFile, zoneViolations } from "../../src/domain/zones.ts";

describe("zones d'ecriture", () => {
  it("reconnait un fichier de test a son chemin ou a son extension", () => {
    for (const path of ["tests/a.js", "src/__tests__/x.ts", "src/a.test.ts", "src/b.spec.tsx", "e2e/flow.ts", "src/Button.stories.tsx"]) assert.ok(isTestFile(path), path);
    for (const path of ["src/a.ts", "src/testing-utils.ts", "README.md"]) assert.ok(!isTestFile(path), path);
  });

  it("rend ce qui sort de la zone du role", () => {
    assert.deepEqual(zoneViolations("tests", ["tests/a.test.js", "src/a.js"]), ["src/a.js"]);
    assert.deepEqual(zoneViolations("code", ["tests/a.test.js", "src/a.js"]), ["tests/a.test.js"]);
  });
});

describe("message de commit", () => {
  it("suit conventional commits et porte la reference du ticket", () => {
    assert.equal(buildCommitMessage({ type: "feat", scope: "lab", subject: "Add the period filter." }, "FT-1"), "feat(lab): add the period filter\n\nRefs: FT-1");
  });

  it("raccourcit un sujet trop long sur un mot entier, et garde le sujet complet dans le corps", () => {
    const subject = "handle the case where the sheet list is empty and the period filter is set to a past month";
    const [header = "", , body] = buildCommitMessage({ type: "fix", subject }, "FT-1").split("\n");
    assert.ok(header.length <= 72, header);
    assert.match(header, /^fix: handle the case .*\w$/);
    assert.equal(body, `${subject}.`);
  });
});

describe("preuves localisees", () => {
  it("lit fichier:ligne et refuse une impression", () => {
    assert.deepEqual(parseEvidence("src/a.ts:42 — le filtre"), { file: "src/a.ts", line: 42 });
    assert.equal(parseEvidence("je pense que"), null);
  });
});

describe("texte publiable", () => {
  it("refuse la mention de l'outil et le texte vide", () => {
    assert.deepEqual(publishableProblems("Salut, la MR est prete."), []);
    assert.equal(publishableProblems("ping @autopilot").length, 1);
    assert.equal(publishableProblems("  ").length, 1);
  });
});

describe("maquettes", () => {
  it("lit les deux formes d'URL et protege le nom de fichier", () => {
    assert.deepEqual(parseFigmaUrl("https://www.figma.com/design/AbC123/Lab?node-id=7155-19416"), { fileKey: "AbC123", nodeId: "7155:19416", url: "https://www.figma.com/design/AbC123/Lab?node-id=7155-19416" });
    assert.equal(findFigmaUrls("voir https://figma.com/file/XYZ et https://example.com").length, 1);
    assert.equal(frameFileName("7155:19416"), "7155-19416.png");
    assert.equal(frameFileName("../../etc"), "etc.png");
  });
});
