/** A passage of the ticket's description, quoted exactly, and the text that replaces it. */
export interface DescriptionEdit {
  readonly before: string;
  readonly after: string;
}

export interface EditedDescription {
  /** The description with every applied edit, everything else kept as it was. */
  readonly document: unknown;
  readonly applied: readonly DescriptionEdit[];
  /** Already in the description: an edit applied by an earlier run. */
  readonly present: readonly DescriptionEdit[];
  /** Found nowhere, or in more than one place. */
  readonly missed: readonly DescriptionEdit[];
}

interface Node {
  type?: string;
  text?: string;
  marks?: unknown[];
  content?: Node[];
  [key: string]: unknown;
}

interface Match {
  readonly block: Node;
  readonly start: number;
  readonly end: number;
}

/**
 * Rewrites only the quoted passages of a Jira document. A passage is matched inside one block —
 * paragraph, heading, list item, table cell — whitespace-insensitively, and must appear exactly
 * once; images, tables, links and marks outside it are left untouched.
 */
export function editDescription(document: unknown, edits: readonly DescriptionEdit[]): EditedDescription {
  const edited = structuredClone(document) as Node;
  const applied: DescriptionEdit[] = [];
  const present: DescriptionEdit[] = [];
  const missed: DescriptionEdit[] = [];
  for (const edit of edits) {
    const matches = find(edited, edit.before);
    const [match] = matches;
    if (match && matches.length === 1) {
      replace(match, edit.after);
      applied.push(edit);
    } else if (matches.length === 0 && edit.after.trim() && find(edited, edit.after).length > 0) {
      present.push(edit);
    } else {
      missed.push(edit);
    }
  }
  return { document: edited, applied, present, missed };
}

/** The plain text of a description, as the ticket snapshot reads it, whitespace collapsed: what an edit must quote. */
export function quotable(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function find(root: Node, passage: string): Match[] {
  const words = quotable(passage).split(" ").filter(Boolean);
  if (words.length === 0) return [];
  const pattern = new RegExp(words.map((word) => word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("\\s+"), "g");
  return blocks(root).flatMap((block) => [...inlineText(block).matchAll(pattern)].map((found) => ({ block, start: found.index, end: found.index + found[0].length })));
}

function blocks(node: Node): Node[] {
  const content = node.content ?? [];
  const inline = content.some((child) => child.type === "text" || child.type === "hardBreak");
  return inline ? [node] : content.flatMap(blocks);
}

function inlineText(block: Node): string {
  return (block.content ?? []).map(textOf).join("");
}

function textOf(node: Node): string {
  if (node.type === "text") return node.text ?? "";
  return node.type === "hardBreak" ? "\n" : "";
}

function replace({ block, start, end }: Match, after: string): void {
  const kept: Node[] = [];
  let offset = 0;
  let inserted = false;
  const insert = (marks: unknown[] | undefined) => {
    if (!inserted) kept.push(...lines(after, marks));
    inserted = true;
  };
  for (const child of block.content ?? []) {
    const text = textOf(child);
    const from = offset;
    const to = offset + text.length;
    offset = to;
    if (text.length === 0 ? from <= start : to <= start) {
      kept.push(child);
    } else if (from >= end) {
      insert(undefined);
      kept.push(child);
    } else if (text.length > 0) {
      if (from < start) kept.push({ ...child, text: text.slice(0, start - from) });
      insert(child.marks);
      if (to > end) kept.push({ ...child, text: text.slice(end - from) });
    }
  }
  insert(undefined);
  block.content = kept;
}

function lines(text: string, marks: unknown[] | undefined): Node[] {
  return text.split("\n").flatMap((line, index) => [...(index ? [{ type: "hardBreak" }] : []), ...(line ? [{ type: "text", text: line, ...(marks ? { marks } : {}) }] : [])]);
}
