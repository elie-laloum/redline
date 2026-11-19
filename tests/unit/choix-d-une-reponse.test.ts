import assert from "node:assert/strict";
import { BoxRenderable } from "@opentui/core";
import { createTestRenderer } from "@opentui/core/testing";
import { describe, it } from "bun:test";
import { type Answer, askedOf, createQuestionPanel } from "../../src/cli/tui/question.ts";
import { THEME } from "../../src/cli/tui/theme.ts";

const LONG = "Les 30 derniers jours glissants, calcules depuis la date du jour, parce que la maquette montre cette fenetre";

/** The question panel on a screen `width` wide, with a question already asked. */
async function panelOf(width: number, request: { key: string; question: string; choices: string[]; allowFreeText?: boolean }, screen: { height?: number; panel?: number } = {}) {
  const { renderer, renderOnce, captureCharFrame, mockInput } = await createTestRenderer({ width, height: screen.height ?? 30 });
  const question = new BoxRenderable(renderer, {
    id: "question",
    ...(screen.panel ? { height: screen.panel } : { flexGrow: 1 }),
    flexDirection: "column",
    border: true,
    borderColor: THEME.focus,
    backgroundColor: THEME.panel,
  });
  const review = new BoxRenderable(renderer, { id: "review", flexGrow: 1, flexDirection: "row", visible: false });
  renderer.root.add(question);
  renderer.root.add(review);
  const panel = createQuestionPanel(renderer, question, review);
  let answer: Answer | null = null;
  panel.show(askedOf(request as never), (given) => {
    answer = given;
  });
  panel.focus();
  // The choices are wrapped at the width the layout gives them, and sized to the room the panel
  // leaves: each pass settles what the previous one laid out.
  await renderOnce();
  await renderOnce();
  await renderOnce();
  return {
    renderer,
    mockInput,
    frame: () => captureCharFrame(),
    answered: () => answer,
    async press(...keys: readonly ("down" | "up" | "enter")[]) {
      for (const key of keys) {
        if (key === "enter") mockInput.pressEnter();
        else mockInput.pressArrow(key);
      }
      await renderOnce();
    },
  };
}

const grill = (choices: string[]) => ({
  key: "functional",
  question: "Grill fonctionnel · 1/2 — Periode par defaut\n\nQuelle periode la liste affiche-t-elle a l'ouverture ?",
  choices,
  allowFreeText: true,
});

describe("les propositions de reponse", () => {
  it("tiennent dans la largeur de l'ecran, mot a mot, aussi longue que soit la phrase", async () => {
    const panel = await panelOf(70, grill(["Mois en cours", LONG]));
    const frame = panel.frame();
    for (const line of frame.split("\n")) assert.ok([...line].length <= 70, `ligne trop longue : ${line}`);
    for (const word of LONG.split(" ")) assert.ok(frame.includes(word), `mot coupe de l'ecran : ${word}`);
    panel.renderer.destroy();
  });

  it("coupent un mot plus long que la colonne plutot que de depasser", async () => {
    const mot = "intercommunication".repeat(3);
    const panel = await panelOf(40, grill([mot]));
    const frame = panel.frame();
    for (const line of frame.split("\n")) assert.ok([...line].length <= 40, `ligne trop longue : ${line}`);
    assert.ok(frame.includes(mot.slice(0, 20)), "le mot long n'est pas rendu");
    panel.renderer.destroy();
  });

  it("se choisissent aux fleches et a Entree, la selection faisant le tour", async () => {
    const panel = await panelOf(70, grill(["Mois en cours", LONG]));
    await panel.press("down", "enter");
    assert.deepEqual(panel.answered(), { value: LONG, note: null });
    panel.renderer.destroy();
  });

  it("gardent Autre reponse en dernier, et le tour y mene", async () => {
    const panel = await panelOf(70, grill(["Mois en cours", LONG]));
    await panel.press("up", "enter");
    assert.equal(panel.answered(), null, "Autre reponse ouvre la zone de texte, elle ne repond pas");
    assert.ok(panel.frame().includes("Ta reponse"), "la zone de texte n'est pas ouverte");
    panel.renderer.destroy();
  });

  it("montrent les quatre decisions de la revue en entier dans sa colonne", async () => {
    const choices = ["Approuver", "Amender le plan", "Rejeter : revoir le fonctionnel", "Rejeter : revoir le technique"];
    const { renderer, renderOnce, captureCharFrame } = await createTestRenderer({ width: 80, height: 30 });
    const question = new BoxRenderable(renderer, { id: "question", flexGrow: 1, flexDirection: "column", visible: false });
    const review = new BoxRenderable(renderer, { id: "review", flexGrow: 1, flexDirection: "row" });
    renderer.root.add(question);
    renderer.root.add(review);
    const panel = createQuestionPanel(renderer, question, review);
    panel.show(askedOf({ key: "review", question: "Revue du plan · 1/1 — Validation\n\nOn etend clamp dans core.", choices, allowFreeText: false } as never), () => {});
    panel.focus();
    await renderOnce();
    await renderOnce();
    const frame = captureCharFrame();
    for (const line of frame.split("\n")) assert.ok([...line].length <= 80, `ligne trop longue : ${line}`);
    for (const word of choices.flatMap((choice) => choice.split(" "))) assert.ok(frame.includes(word), `mot coupe de l'ecran : ${word}`);
    renderer.destroy();
  });

  it("laissent au texte de la question la place de se lire quand le panneau est bas, et defilent", async () => {
    const question = "A la validation de la modale, une ligne de detail est ajoutee dans la famille concernee, a la date de l'ecriture. Cote feuille de travail, une operation est rangee dans une valorisation, c'est-a-dire une periode de revision de la famille. Il peut y en avoir deux qui couvrent la meme date, ou aucune. Ou va la ligne de detail ?";
    const choices = [1, 2, 3, 4].map((n) => `Choix ${n} : dans la valorisation dont la periode contient la date, le bilan si plusieurs, et sinon une consequence decrite en detail`);
    const panel = await panelOf(90, { key: "functional", question: `Grill fonctionnel · 2/5 — Rattachement — valorisation cible\n\n${question}`, choices, allowFreeText: true }, { height: 40, panel: 16 });
    const frame = panel.frame();
    assert.match(frame, /Rattachement — valorisation cible/);
    assert.match(frame, /A la validation de la modale/);
    assert.match(frame, /│detail \?/);
    assert.match(frame, /Choix 1/);
    await panel.press("down", "down", "down");
    assert.match(panel.frame(), /Choix 4/);
    panel.renderer.destroy();
  });
});
