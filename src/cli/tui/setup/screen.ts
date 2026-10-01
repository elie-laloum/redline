import { BoxRenderable, type CliRenderer, InputRenderable, InputRenderableEvents, type KeyEvent, TextRenderable } from "@opentui/core";
import type { Tone } from "../../dashboard/model.ts";
import { SECTION_LABELS, SECTIONS, type SectionId, type SectionState, type SectionStatus } from "../../setup/sections.ts";
import { badge, fit, type Line, span, styled, wrap } from "../text.ts";
import { THEME, type ThemeColor } from "../theme.ts";

export interface Edit {
  readonly initial: string;
  readonly secret?: boolean;
  readonly placeholder?: string;
  commit(text: string): Promise<void> | void;
}

type Reset = { readonly reset?: () => Promise<void> | void };

export type Row =
  | { readonly kind: "heading"; readonly text: string }
  | { readonly kind: "note"; readonly text: string; readonly tone?: Tone | "muted" }
  | ({ readonly kind: "field"; readonly label: string; readonly value: string; readonly tone?: Tone | "muted"; readonly badge?: string; readonly edit: Edit } & Reset)
  | ({ readonly kind: "toggle"; readonly label: string; readonly on: boolean; set(on: boolean): Promise<void> | void } & Reset)
  | ({ readonly kind: "choice"; readonly label: string; readonly value: string; readonly options: readonly string[]; set(value: string): Promise<void> | void } & Reset)
  | { readonly kind: "action"; readonly label: string; readonly detail?: string; run(): Promise<void> | void };

export interface Page {
  readonly title: string;
  readonly rows: readonly Row[];
}

export interface ScreenSource {
  statuses(): Readonly<Record<SectionId, SectionStatus>>;
  /** The page of a section; a sub-page opened inside it is rebuilt by its own builder. */
  page(section: SectionId): Page;
  readonly title: string;
}

export interface SetupScreen {
  /** Shows a sub-page over the current section's; Esc goes back to it. */
  open(page: () => Page): void;
  notify(tone: Tone, text: string | null): void;
  /** Rebuilds statuses and pages from the source, after a write or an answer. */
  refresh(): void;
  select(section: SectionId): void;
  /** Resolves when the human leaves: q or Ctrl-C. */
  readonly left: Promise<void>;
  destroy(): void;
}

const STATES: Record<SectionState, { readonly icon: string; readonly color: ThemeColor }> = {
  ok: { icon: "✓", color: "success" },
  missing: { icon: "○", color: "warning" },
  failing: { icon: "✗", color: "danger" },
  default: { icon: "·", color: "muted" },
  off: { icon: "–", color: "faint" },
  pending: { icon: "…", color: "muted" },
};
const TONES: Record<Tone | "muted", ThemeColor> = { info: "text", success: "success", warning: "warning", error: "danger", muted: "muted" };
const SIDEBAR = 34;
const LABEL = 30;
const FOOTER = "↑↓ choisir · Entree ouvrir/modifier · PgUp/PgDn defiler · Esc revenir · r defaut · s section a remplir · q quitter";
const EDIT_FOOTER = "Entree enregistrer · Esc annuler";

const selectable = (row: Row) => row.kind === "field" || row.kind === "toggle" || row.kind === "choice" || row.kind === "action";

export function createSetupScreen(renderer: CliRenderer, source: ScreenSource, first: SectionId): SetupScreen {
  const box = (id: string, options: ConstructorParameters<typeof BoxRenderable>[1]) =>
    new BoxRenderable(renderer, { id, border: true, borderStyle: "rounded", borderColor: THEME.border, titleColor: THEME.muted, backgroundColor: THEME.panel, paddingX: 1, ...options });
  const text = (id: string) => new TextRenderable(renderer, { id, content: "", fg: THEME.text, wrapMode: "none" });

  const root = new BoxRenderable(renderer, { id: "setup", flexDirection: "column", width: "100%", height: "100%", backgroundColor: THEME.background });
  const header = box("setup-header", { height: 3 });
  const headerText = text("setup-header-text");
  header.add(headerText);
  const body = new BoxRenderable(renderer, { id: "setup-body", flexDirection: "row", flexGrow: 1, backgroundColor: THEME.background });
  const sidebar = box("setup-sections", { title: " Sections ", width: SIDEBAR, flexShrink: 0 });
  const sidebarText = text("setup-sections-text");
  sidebar.add(sidebarText);
  const panel = box("setup-panel", { flexGrow: 1, flexDirection: "column" });
  const panelText = text("setup-panel-text");
  panelText.flexGrow = 1;
  panel.add(panelText);
  const editor = box("setup-edit", { height: 3, flexDirection: "row", visible: false, borderColor: THEME.focus });
  const editLabel = text("setup-edit-label");
  const input = new InputRenderable(renderer, {
    id: "setup-edit-input",
    flexGrow: 1,
    backgroundColor: THEME.background,
    focusedBackgroundColor: THEME.background,
    textColor: THEME.text,
    focusedTextColor: THEME.text,
    placeholderColor: THEME.faint,
  });
  editor.add(editLabel);
  editor.add(input);
  panel.add(editor);
  body.add(sidebar);
  body.add(panel);
  const message = new TextRenderable(renderer, { id: "setup-message", content: "", height: 1, bg: THEME.background });
  const footer = new TextRenderable(renderer, { id: "setup-footer", content: "", height: 1, bg: THEME.background });
  for (const child of [header, body, message, footer]) root.add(child);
  renderer.root.add(root);

  let section: SectionId = first;
  let stack: (() => Page)[] = [];
  let focus: "sections" | "rows" | "edit" = "sections";
  let selected = 0;
  /** Lines scrolled by hand, past what the selection shows; reset when the selection moves. */
  let scrolled: number | null = null;
  let editing: Edit | null = null;
  let busy = false;
  let notice: { tone: Tone; text: string } | null = null;
  let statuses = source.statuses();
  let page = source.page(section);
  let scheduled: ReturnType<typeof setTimeout> | null = null;
  let shownOffset = 0;
  let shownHeight = 10;
  let leave: () => void = () => {};
  const left = new Promise<void>((resolve) => {
    leave = resolve;
  });

  const rows = () => page.rows;
  const choices = () => rows().flatMap((row, index) => (selectable(row) ? [index] : []));
  const current = (): Row | undefined => rows()[choices()[selected] ?? -1];
  const rebuild = () => {
    statuses = source.statuses();
    page = stack.at(-1)?.() ?? source.page(section);
    selected = Math.max(0, Math.min(selected, choices().length - 1));
    schedule();
  };
  const schedule = () => {
    scheduled ??= setTimeout(draw, 30);
  };

  const run = async (work: () => Promise<void> | void) => {
    if (busy) return;
    busy = true;
    schedule();
    try {
      await work();
    } catch (error) {
      notice = { tone: "error", text: error instanceof Error ? error.message : String(error) };
    } finally {
      busy = false;
      rebuild();
    }
  };

  const startEdit = (edit: Edit) => {
    editing = edit;
    focus = "edit";
    editor.visible = true;
    input.value = edit.secret ? "" : edit.initial;
    input.placeholder = edit.placeholder ?? "";
    // A pasted token stays out of sight: the field shows its length only.
    input.textColor = edit.secret ? THEME.background : THEME.text;
    input.focusedTextColor = edit.secret ? THEME.background : THEME.text;
    input.focus();
    schedule();
  };
  const stopEdit = () => {
    editing = null;
    focus = "rows";
    editor.visible = false;
    input.blur();
    schedule();
  };
  input.on(InputRenderableEvents.ENTER, () => {
    const edit = editing;
    if (!edit) return;
    const value = input.value;
    stopEdit();
    void run(() => edit.commit(value));
  });
  input.on(InputRenderableEvents.INPUT, () => {
    if (editing?.secret) schedule();
  });

  const activate = (row: Row) => {
    switch (row.kind) {
      case "field":
        return startEdit(row.edit);
      case "toggle":
        return void run(() => row.set(!row.on));
      case "choice":
        return void run(() => row.set(row.options[(row.options.indexOf(row.value) + 1) % row.options.length] ?? row.value));
      case "action":
        return void run(() => row.run());
    }
  };

  const onKey = (key: KeyEvent) => {
    if (key.ctrl && key.name === "c") return leave();
    if (focus === "edit") {
      if (key.name === "escape") stopEdit();
      return;
    }
    if (busy) return;
    if (key.name === "q") return leave();
    if (key.name === "s") {
      const next = SECTIONS.find((id, index) => index > SECTIONS.indexOf(section) && (statuses[id].state === "missing" || statuses[id].state === "failing")) ?? SECTIONS.find((id) => statuses[id].state === "missing" || statuses[id].state === "failing");
      if (next) {
        go(next);
        focus = "rows";
      } else notice = { tone: "success", text: "Plus rien a remplir : lance la verification." };
      return schedule();
    }
    if (key.name === "tab") {
      key.preventDefault();
      focus = focus === "sections" ? "rows" : "sections";
      return schedule();
    }
    if (focus === "sections") {
      if (key.name === "up" || key.name === "k") go(SECTIONS[Math.max(0, SECTIONS.indexOf(section) - 1)] ?? section);
      else if (key.name === "down" || key.name === "j") go(SECTIONS[Math.min(SECTIONS.length - 1, SECTIONS.indexOf(section) + 1)] ?? section);
      else if (key.name === "return" || key.name === "right" || key.name === "l") focus = "rows";
      return schedule();
    }
    const row = current();
    if (key.name !== "pageup" && key.name !== "pagedown") scrolled = null;
    switch (key.name) {
      case "up":
      case "k":
        selected = Math.max(0, selected - 1);
        break;
      case "down":
      case "j":
        selected = Math.min(choices().length - 1, selected + 1);
        break;
      case "pageup":
      case "pagedown":
        scrolled = (scrolled ?? shownOffset) + (key.name === "pageup" ? -1 : 1) * Math.max(1, shownHeight - 2);
        break;
      case "return":
      case "space":
        // The field about to take the focus must not receive this key too: it would submit at once.
        key.preventDefault();
        if (row) activate(row);
        break;
      case "right":
      case "left":
        if (row?.kind === "choice") {
          const step = key.name === "right" ? 1 : row.options.length - 1;
          void run(() => row.set(row.options[(row.options.indexOf(row.value) + step) % row.options.length] ?? row.value));
        } else if (key.name === "left") back();
        break;
      case "escape":
        back();
        break;
      case "r":
        if (row && "reset" in row && row.reset) void run(row.reset);
        break;
    }
    schedule();
  };
  renderer.keyInput.on("keypress", onKey);
  renderer.on("resize", schedule);

  const back = () => {
    if (stack.length > 0) {
      stack = stack.slice(0, -1);
      selected = 0;
      rebuild();
    } else focus = "sections";
  };
  const go = (id: SectionId) => {
    section = id;
    stack = [];
    selected = 0;
    scrolled = null;
    notice = null;
    rebuild();
  };

  function draw() {
    scheduled = null;
    if (renderer.isDestroyed) return;
    const width = renderer.width;
    headerText.content = styled([[badge("REDLINE", "accent"), span("  "), span("Configuration", "text", { bold: true }), span(`  ${source.title}`, "muted")]]);

    sidebarText.content = styled(
      SECTIONS.flatMap((id): Line[] => {
        const status = statuses[id];
        const state = STATES[status.state];
        const chosen = id === section;
        const background = chosen ? { bg: (focus === "sections" ? "selection" : "panel") as ThemeColor } : {};
        return [[span(` ${state.icon} `, state.color, background), span(fit(SECTION_LABELS[id], SIDEBAR - 8), "text", { bold: chosen, ...background })]];
      }),
    );
    sidebar.borderColor = focus === "sections" ? THEME.focus : THEME.border;
    panel.borderColor = focus === "sections" ? THEME.border : THEME.focus;
    panel.title = ` ${page.title} `;

    const inner = Math.max(30, width - SIDEBAR - 6);
    const status = statuses[section];
    const lines: { line: Line; row: number | null }[] = [];
    if (stack.length === 0) {
      lines.push({ line: [span(`${STATES[status.state].icon} ${status.detail}`, STATES[status.state].color)], row: null }, { line: [], row: null });
    }
    rows().forEach((row, index) => {
      for (const line of rowLines(row, inner, index === choices()[selected] && focus !== "sections")) lines.push({ line, row: index });
    });
    const height = Math.max(3, (panel.height || renderer.height - 8) - 2 - (editor.visible ? 3 : 0));
    const target = lines.findIndex((entry) => entry.row === choices()[selected]);
    const offset = Math.max(0, Math.min(scrolled ?? target - Math.floor(height / 2), lines.length - height));
    shownOffset = offset;
    shownHeight = height;
    panelText.content = styled(lines.slice(offset, offset + height).map((entry) => entry.line));

    if (editing) {
      const label = rowLabel(current());
      editLabel.content = styled([[span(`${label}${editing.secret ? ` (masque, ${input.value.length} car.)` : ""} : `, "muted")]]);
    }
    const shown = busy ? { tone: "info" as const, text: "… en cours" } : notice;
    message.content = styled([[span(` ${shown?.text.split("\n")[0] ?? ""}`, shown ? TONES[shown.tone] : "muted")]]);
    footer.content = styled([[span(` ${focus === "edit" ? EDIT_FOOTER : FOOTER}`, "muted")]]);
    renderer.requestRender();
  }

  rebuild();

  return {
    open(builder) {
      stack = [...stack, builder];
      selected = 0;
      focus = "rows";
      rebuild();
    },
    notify(tone, value) {
      notice = value === null ? null : { tone, text: value };
      schedule();
    },
    refresh: rebuild,
    select(id) {
      go(id);
    },
    left,
    destroy() {
      if (scheduled) clearTimeout(scheduled);
      renderer.keyInput.off("keypress", onKey);
      renderer.off("resize", schedule);
      if (!renderer.isDestroyed) root.destroyRecursively();
    },
  };
}

function rowLabel(row: Row | undefined): string {
  return row && "label" in row ? row.label : "";
}

function rowLines(row: Row, width: number, chosen: boolean): Line[] {
  const background = chosen ? { bg: "selection" as const } : {};
  const pointer = span(chosen ? "› " : "  ", "accent", background);
  switch (row.kind) {
    case "heading":
      return [[], [span(row.text, "accent", { bold: true })]];
    case "note":
      return wrap(row.text, width).map((line): Line => [span(line, TONES[row.tone ?? "muted"])]);
    case "field": {
      const value = row.value || "—";
      return [
        [
          pointer,
          span(fit(row.label, LABEL), "text", background),
          span(fit(value, Math.max(4, width - LABEL - 4 - (row.badge ? row.badge.length + 3 : 0))).trimEnd(), TONES[row.tone ?? "info"], background),
          ...(row.badge ? [span(`  ${row.badge}`, "warning", background)] : []),
        ],
      ];
    }
    case "toggle":
      return [[pointer, span(fit(row.label, LABEL), "text", background), span(row.on ? "● oui" : "○ non", row.on ? "success" : "muted", background)]];
    case "choice":
      return [[pointer, span(fit(row.label, LABEL), "text", background), span(`‹ ${row.value} ›`, "info", background)]];
    case "action":
      return [[pointer, span(`▸ ${row.label}`, "accent", { bold: chosen, ...background }), ...(row.detail ? [span(`  ${row.detail}`, "muted", background)] : [])]];
  }
}
