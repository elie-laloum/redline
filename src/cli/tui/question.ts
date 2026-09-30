import { BoxRenderable, type CliRenderer, ScrollBoxRenderable, SelectRenderable, SelectRenderableEvents, TextareaRenderable, TextRenderable } from "@opentui/core";
import type { WorkflowInputRequest } from "@elie-laloum/outpost";
import { CHOICES } from "../../phases/framing/review.ts";
import { type Line, span, styled, wrap } from "./text.ts";
import { THEME } from "./theme.ts";

/** A question as the panels show it. */
export interface Asked {
  readonly key: string;
  readonly title: string;
  readonly header: string;
  readonly body: string;
  readonly choices: readonly string[];
  readonly freeText: boolean;
  /** The plan review: the plan fills the left column, and a decision other than approval asks for its note at once. */
  readonly review: boolean;
}

export interface Answer {
  readonly value: string;
  /** The review's note, collected with the decision so the follow-up question needs no second form. */
  readonly note: string | null;
}

export interface QuestionPanel {
  show(asked: Asked, answer: (answer: Answer) => void): void;
  hide(): void;
  focus(): void;
  /** Lets the dashboard have the keys while the question waits. */
  blur(): void;
  /** Esc: from the text area back to the choices; false when there is nowhere to go back to. */
  back(): boolean;
  scroll(pages: number): void;
}

const OTHER = "Autre reponse…";
const EMPTY = "Une reponse vide ne tranche rien.";

export function askedOf(request: WorkflowInputRequest): Asked {
  const [first = "", ...rest] = request.question.split("\n");
  const [title = first, header = ""] = first.split(" — ");
  const choices = request.choices ?? [];
  return {
    key: request.key,
    title,
    header,
    body: rest.join("\n").trim(),
    choices,
    freeText: request.allowFreeText !== false,
    review: request.key === "review" && choices.length > 0,
  };
}

export function createQuestionPanel(renderer: CliRenderer, grillSlot: BoxRenderable, reviewSlot: BoxRenderable): QuestionPanel {
  const grill = {
    heading: new TextRenderable(renderer, { id: "grill-heading", content: "", fg: THEME.text, height: 1 }),
    body: new ScrollBoxRenderable(renderer, { id: "grill-body", flexGrow: 1, flexShrink: 1, backgroundColor: THEME.panel }),
    bodyText: new TextRenderable(renderer, { id: "grill-body-text", content: "", fg: THEME.text, wrapMode: "none" }),
    form: createForm(renderer, "grill"),
  };
  grill.body.add(grill.bodyText);
  for (const child of [grill.heading, grill.body, grill.form.box]) grillSlot.add(child);

  const review = {
    plan: new ScrollBoxRenderable(renderer, {
      id: "review-plan",
      title: " Plan ",
      width: "64%",
      flexShrink: 0,
      border: true,
      borderStyle: "rounded",
      borderColor: THEME.border,
      titleColor: THEME.muted,
      backgroundColor: THEME.panel,
      contentOptions: { paddingX: 1 },
    }),
    planText: new TextRenderable(renderer, { id: "review-plan-text", content: "", fg: THEME.text, wrapMode: "word" }),
    side: new BoxRenderable(renderer, {
      id: "review-side",
      title: " Decision ",
      flexGrow: 1,
      flexDirection: "column",
      border: true,
      borderStyle: "rounded",
      borderColor: THEME.focus,
      titleColor: THEME.muted,
      backgroundColor: THEME.panel,
      paddingX: 1,
    }),
    form: createForm(renderer, "review"),
  };
  review.plan.add(review.planText);
  review.side.add(review.form.box);
  reviewSlot.add(review.plan);
  reviewSlot.add(review.side);

  let current: { readonly asked: Asked; readonly form: Form } | null = null;

  return {
    show(asked, answer) {
      const form = asked.review ? review.form : grill.form;
      current = { asked, form };
      if (asked.review) {
        review.planText.content = styled(planLines(asked.body));
        review.plan.scrollTop = 0;
      } else {
        grillSlot.title = ` ${asked.title} `;
        grill.heading.content = styled([[span(asked.header || asked.title, "warning", { bold: true })]]);
        grill.bodyText.content = styled(wrap(asked.body, Math.max(20, renderer.width - 7)).map((line): Line => [span(line)]));
        grill.body.scrollTop = 0;
      }
      form.start({
        choices: asked.choices,
        freeText: asked.freeText,
        noteFor: asked.review ? (choice) => (CHOICES[choice] === "approve" ? null : "Ce qui doit changer : la note est transmise telle quelle.") : () => null,
        answer,
      });
    },
    hide() {
      current = null;
      grill.form.stop();
      review.form.stop();
    },
    focus() {
      current?.form.focus();
    },
    blur() {
      grill.form.blur();
      review.form.blur();
    },
    back() {
      return current?.form.back() ?? false;
    },
    scroll(pages) {
      const box = current?.asked.review ? review.plan : grill.body;
      box.scrollBy(pages * Math.max(1, box.height - 2));
    },
  };
}

interface Form {
  readonly box: BoxRenderable;
  start(options: { choices: readonly string[]; freeText: boolean; noteFor: (choice: string) => string | null; answer: (answer: Answer) => void }): void;
  stop(): void;
  focus(): void;
  blur(): void;
  back(): boolean;
}

/** Choices first, then a text area for a free answer or a note; Enter sends it. */
function createForm(renderer: CliRenderer, id: string): Form {
  const box = new BoxRenderable(renderer, { id: `${id}-form`, flexDirection: "column", flexShrink: 0, backgroundColor: THEME.panel });
  const select = new SelectRenderable(renderer, {
    id: `${id}-select`,
    options: [],
    showDescription: false,
    wrapSelection: true,
    backgroundColor: THEME.panel,
    focusedBackgroundColor: THEME.panel,
    textColor: THEME.text,
    focusedTextColor: THEME.text,
    selectedBackgroundColor: THEME.selection,
    selectedTextColor: THEME.text,
  });
  const label = new TextRenderable(renderer, { id: `${id}-label`, content: "", fg: THEME.muted, wrapMode: "word", visible: false });
  const textarea = new TextareaRenderable(renderer, {
    id: `${id}-textarea`,
    height: 5,
    visible: false,
    placeholder: "Ta reponse…",
    placeholderColor: THEME.faint,
    backgroundColor: THEME.background,
    focusedBackgroundColor: THEME.background,
    textColor: THEME.text,
    focusedTextColor: THEME.text,
    wrapMode: "word",
    // Enter sends. Shift+Enter needs a terminal that reports it (kitty keyboard protocol): Alt+Enter
    // and Ctrl-J add a line everywhere.
    keyBindings: [
      { name: "return", action: "submit" },
      { name: "kpenter", action: "submit" },
      { name: "return", shift: true, action: "newline" },
      { name: "return", meta: true, action: "newline" },
      { name: "linefeed", action: "newline" },
    ],
  });
  const hint = new TextRenderable(renderer, { id: `${id}-hint`, content: "", fg: THEME.muted, wrapMode: "word", marginTop: 1 });
  for (const child of [select, label, textarea, hint]) box.add(child);

  let session: { choices: readonly string[]; noteFor: (choice: string) => string | null; answer: (answer: Answer) => void; chosen: string | null } | null = null;

  const showHint = (text: string, warning = false) => {
    hint.content = styled([[span(text, warning ? "warning" : "muted")]]);
  };
  const toChoices = () => {
    textarea.visible = false;
    label.visible = false;
    select.visible = true;
    select.focus();
    showHint("↑↓ choisir · Entree valider · Tab relire le tableau de bord");
  };
  const toText = (caption: string) => {
    select.visible = false;
    label.content = styled([[span(caption, "muted")]]);
    label.visible = true;
    textarea.visible = true;
    textarea.clear();
    textarea.focus();
    showHint(`Entree envoyer · Shift+Entree ou Alt+Entree nouvelle ligne${session?.choices.length ? " · Esc revenir aux choix" : ""}`);
  };

  select.on(SelectRenderableEvents.ITEM_SELECTED, (_index: number, option: { value?: string } | null) => {
    if (!session || !option?.value) return;
    const choice = option.value;
    if (choice === OTHER) return toText("Ta reponse, en clair :");
    const note = session.noteFor(choice);
    if (note === null) return session.answer({ value: choice, note: null });
    session.chosen = choice;
    toText(note);
  });
  textarea.onSubmit = () => {
    if (!session) return;
    const text = textarea.plainText.trim();
    if (!text) return showHint(EMPTY, true);
    if (session.chosen) return session.answer({ value: session.chosen, note: text });
    session.answer({ value: text, note: null });
  };

  return {
    box,
    start({ choices, freeText, noteFor, answer }) {
      session = { choices, noteFor, answer, chosen: null };
      const options = [...choices, ...(freeText && choices.length ? [OTHER] : [])];
      select.options = options.map((choice) => ({ name: choice, description: "", value: choice }));
      select.height = Math.max(1, options.length);
      select.setSelectedIndex(0);
      if (choices.length) toChoices();
      else toText("Ta reponse, en clair :");
    },
    stop() {
      session = null;
      select.blur();
      textarea.blur();
    },
    blur() {
      select.blur();
      textarea.blur();
    },
    focus() {
      if (textarea.visible) textarea.focus();
      else select.focus();
    },
    back() {
      if (!session || !textarea.visible || session.choices.length === 0) return false;
      session.chosen = null;
      toChoices();
      return true;
    },
  };
}

function planLines(body: string): Line[] {
  return body.split("\n").map((line): Line => {
    if (/^(Impactes|Ecartes|Points ouverts) :$/.test(line)) return [span(line, "accent", { bold: true })];
    if (/^\d+\. /.test(line)) return [span(line, "text", { bold: true })];
    if (/^\s+[TC]\d+ /.test(line)) return [span(line, "muted")];
    if (/^Attention :/.test(line)) return [span(line, "warning", { bold: true })];
    return [span(line)];
  });
}
