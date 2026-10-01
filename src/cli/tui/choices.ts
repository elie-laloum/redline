import { type CliRenderer, type KeyEvent, TextRenderable } from "@opentui/core";
import { type Line, span, styled, wrap } from "./text.ts";
import { THEME } from "./theme.ts";

/** One rendered line; every line of a wrapped choice carries the choice it belongs to. */
interface Row {
  readonly choice: number;
  readonly text: string;
  /** The choice's first line: the one that carries the marker. */
  readonly head: boolean;
}

const MARK = "▶ ";
const BLANK = "  ";
/** The column the panel keeps on the left, plus the marker's own. */
const GUTTER = 1 + MARK.length;
const NARROWEST = 8;

/**
 * The answers to a question, each wrapped over as many lines as it needs: a long proposal stays
 * readable in a narrow panel instead of being cut at its edge, which is what OpenTUI's own
 * `SelectRenderable` does with its one clipped line per option. Keys and selection are the same:
 * `↑` `↓` / `j` `k` wrap around, `Enter` sends the choice.
 */
export class ChoiceList extends TextRenderable {
  private readonly renderer: CliRenderer;
  private readonly chosen: (choice: string) => void;
  private choices: readonly string[] = [];
  private rows: readonly Row[] = [];
  private index = 0;
  /** First rendered row, when the choices need more lines than the panel can give. */
  private offset = 0;
  /** The width the rows were wrapped at, so a resize rewraps them and nothing else does. */
  private wrappedAt = -1;

  constructor(renderer: CliRenderer, id: string, chosen: (choice: string) => void) {
    super(renderer, { id, content: "", fg: THEME.text, bg: THEME.panel, wrapMode: "none", flexShrink: 0, height: 1 });
    this.renderer = renderer;
    this.chosen = chosen;
    this.focusable = true;
  }

  /** Starts over on `choices`, the first one selected. */
  start(choices: readonly string[]): void {
    this.choices = choices;
    this.index = 0;
    this.offset = 0;
    this.wrappedAt = -1;
    this.relayout();
  }

  get selected(): string | null {
    return this.choices[this.index] ?? null;
  }

  handleKeyPress(key: KeyEvent): boolean {
    if (this.choices.length === 0) return false;
    switch (key.name) {
      case "up":
      case "k":
        return this.move(-1);
      case "down":
      case "j":
        return this.move(1);
      case "return":
      case "kpenter":
      case "linefeed": {
        const choice = this.selected;
        if (choice === null) return false;
        this.chosen(choice);
        return true;
      }
      default:
        return false;
    }
  }

  protected renderSelf(buffer: Parameters<TextRenderable["render"]>[0]): void {
    // The panel is laid out after the question is shown, and resizing it rewraps the choices.
    if (this.width !== this.wrappedAt) this.relayout();
    super.renderSelf(buffer);
  }

  private move(step: number): boolean {
    this.index = (this.index + step + this.choices.length) % this.choices.length;
    this.reveal();
    this.paint();
    return true;
  }

  private relayout(): void {
    const width = Math.max(NARROWEST, this.width - GUTTER);
    this.rows = this.choices.flatMap((choice, index) => wrap(choice, width).map((text, line): Row => ({ choice: index, text, head: line === 0 })));
    this.wrappedAt = this.width;
    // Half the screen at most: the question's own text keeps the rest, and the list scrolls.
    this.height = Math.max(1, Math.min(this.rows.length, Math.max(3, Math.floor(this.renderer.height / 2))));
    this.reveal();
    this.paint();
  }

  /** Scrolls the least it can to show every line of the selected choice. */
  private reveal(): void {
    const height = Math.max(1, this.height);
    const first = this.rows.findIndex((row) => row.choice === this.index);
    if (first < 0) return;
    const last = this.rows.findLastIndex((row) => row.choice === this.index);
    if (first < this.offset) this.offset = first;
    else if (last >= this.offset + height) this.offset = Math.min(first, last - height + 1);
    this.offset = Math.max(0, Math.min(this.offset, Math.max(0, this.rows.length - height)));
  }

  private paint(): void {
    const width = Math.max(1, this.width);
    const window = this.rows.slice(this.offset, this.offset + Math.max(1, this.height));
    this.content = styled(
      window.map((row): Line => {
        const selected = row.choice === this.index;
        const text = ` ${row.head ? (selected ? MARK : BLANK) : BLANK}${row.text}`;
        // The selection is a full-width band, so a choice over several lines reads as one block.
        return [selected ? span(text.padEnd(width), "text", { bg: "selection" }) : span(text)];
      }),
    );
  }
}
