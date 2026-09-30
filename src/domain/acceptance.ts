import type { Criterion } from "./ticket.ts";

type AdfNode = { readonly type?: string; readonly text?: string; readonly content?: unknown; readonly attrs?: Record<string, unknown>; readonly marks?: readonly { type?: string; attrs?: { href?: string } }[] };

const BLOCKS = new Set(["paragraph", "heading", "codeBlock", "blockquote", "tableRow"]);
const LISTS = new Set(["bulletList", "orderedList"]);

export function flattenDocument(node: unknown): string {
  if (node == null) return "";
  if (typeof node === "string") return node;
  if (Array.isArray(node)) return node.map(flattenDocument).join("");
  const record = node as AdfNode;
  if (record.type === "text") {
    const href = record.marks?.find((mark) => mark.type === "link")?.attrs?.href;
    return href ? `${record.text ?? ""} (${href})` : (record.text ?? "");
  }
  if (record.type === "hardBreak") return "\n";
  if (record.type === "inlineCard" || record.type === "blockCard") return String(record.attrs?.url ?? "");
  const inner = flattenDocument(record.content);
  // One line per item, and a blank line after the list: the criteria section ends there.
  if (record.type === "listItem") return `- ${inner.replace(/\n+$/, "")}\n`;
  if (LISTS.has(record.type ?? "")) return `${inner}\n`;
  return BLOCKS.has(record.type ?? "") ? `${inner}\n` : inner;
}

export function toDocument(text: string): unknown {
  return {
    type: "doc",
    version: 1,
    content: text.split("\n\n").map((paragraph) => ({ type: "paragraph", content: [{ type: "text", text: paragraph || " " }] })),
  };
}

const HEADING = /(crit[eè]res? d'acceptation|acceptance criteria|dod|definition of done)\s*:?\s*\n/i;

export function extractAcceptanceCriteria(description: string): string | null {
  const match = HEADING.exec(description);
  if (!match) return null;
  const after = description.slice(match.index + match[0].length).trim();
  return after ? (after.split(/\n\s*\n/)[0]?.trim() ?? null) : null;
}

const BULLET = /^\s*(?:[-*•]|\d+[.)])\s+/;

export function splitCriteria(section: string | null, fallback: string): readonly Criterion[] {
  const lines = (section ?? "").split("\n").map((line) => line.replace(BULLET, "").trim()).filter(Boolean);
  const texts = lines.length > 0 ? lines : [fallback.trim()];
  return texts.map((text, index) => ({ id: `AC${index + 1}`, text }));
}

const URL_PATTERN = /https?:\/\/[^\s)\]]+/g;

export function collectUrls(description: string, attachments: readonly { readonly content?: string }[]): string[] {
  const urls = new Set<string>(description.match(URL_PATTERN) ?? []);
  for (const attachment of attachments) if (attachment.content) urls.add(attachment.content);
  return [...urls];
}
