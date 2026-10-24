import { bg, bold, fg, StyledText, type TextChunk } from "@opentui/core";
import { THEME, type ThemeColor } from "./theme.ts";

export type Line = readonly TextChunk[];

export function span(text: string, color: ThemeColor = "text", style: { readonly bold?: boolean; readonly bg?: ThemeColor } = {}): TextChunk {
  let chunk = fg(THEME[color])(text);
  if (style.bold) chunk = bold(chunk);
  if (style.bg) chunk = bg(THEME[style.bg])(chunk);
  return chunk;
}

export function badge(text: string, color: ThemeColor): TextChunk {
  return span(` ${text} `, "onBadge", { bold: true, bg: color });
}

export function styled(lines: readonly Line[]): StyledText {
  return new StyledText(lines.flatMap((line, index) => (index === 0 ? [...line] : [span("\n"), ...line])));
}

export function fit(text: string, width: number): string {
  if (width <= 0) return "";
  const flat = text.replace(/[\t\r\n]+/g, " ");
  return flat.length > width ? `${flat.slice(0, Math.max(0, width - 1))}…` : flat.padEnd(width);
}

export function bar(ratio: number, width: number): string {
  const filled = Math.round(Math.min(1, Math.max(0, ratio)) * width);
  return "█".repeat(filled) + "░".repeat(width - filled);
}

const LEVELS = "▁▂▃▄▅▆▇█";

export function sparkline(values: readonly number[]): string {
  const top = Math.max(...values, 0);
  if (top === 0) return LEVELS[0]?.repeat(values.length) ?? "";
  return values.map((value) => LEVELS[Math.min(LEVELS.length - 1, Math.floor((value / top) * (LEVELS.length - 1)))]).join("");
}

/** Wraps plain text to `width` columns, keeping the author's line breaks. */
export function wrap(text: string, width: number): string[] {
  if (width <= 0) return [];
  return text.split("\n").flatMap((paragraph) => {
    const words = paragraph.split(/ +/);
    const lines: string[] = [];
    let current = "";
    for (const word of words) {
      if (current && current.length + 1 + word.length > width) {
        lines.push(current);
        current = "";
      }
      let rest = current ? `${current} ${word}` : word;
      while (rest.length > width) {
        lines.push(rest.slice(0, width));
        rest = rest.slice(width);
      }
      current = rest;
    }
    lines.push(current);
    return lines;
  });
}

/**
 * Trims a notice to `max` lines by keeping its first line and its last ones, the elision counted
 * in between. A command's output ends on what made it fail, so keeping only the head drops the
 * one part worth reading.
 */
export function fitNotice(lines: readonly string[], max: number): string[] {
  if (max <= 0) return [];
  if (lines.length <= max) return [...lines];
  if (max <= 2) return lines.slice(-max);
  const tail = lines.slice(-(max - 2));
  return [lines[0] ?? "", `… ${lines.length - tail.length - 1} ligne(s) masquee(s), journal complet : redline status`, ...tail];
}
