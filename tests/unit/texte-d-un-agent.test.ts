import assert from "node:assert/strict";
import { describe, it } from "bun:test";
import { withoutResponseBlock } from "../../src/cli/tui/text.ts";

describe("le texte d'un agent a l'ecran", () => {
  it("retire le bloc de reponse ferme et garde ce que l'agent a dit", () => {
    const said = 'J\'ai corrige les trois specs signalees.\n\n<tests>{"files": [{"path": "a.spec.tsx", "tests": ["T22"]}]}</tests>';

    assert.equal(withoutResponseBlock(said), "J'ai corrige les trois specs signalees.");
  });

  it("retire aussi un bloc encore en cours d'ecriture", () => {
    const said = 'Je relis la grille.\n\n<verdict>{"lines": [{"id": "T1", "verdict": "passe"';

    assert.equal(withoutResponseBlock(said), "Je relis la grille.");
  });

  it("ne touche pas a une prose qui parle de balises", () => {
    const said = "Le composant rend un <div> vide quand la liste est vide.";

    assert.equal(withoutResponseBlock(said), said);
  });

  it("rend une chaine vide quand l'agent n'a dit que son bloc", () => {
    assert.equal(withoutResponseBlock('<tests>{"files": []}</tests>'), "");
  });
});
