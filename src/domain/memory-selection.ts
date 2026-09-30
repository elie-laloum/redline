import type { Note } from "./memory.ts";

export interface SelectionLimits {
  readonly maxNotes: number;
  readonly maxLines: number;
}

export interface SelectionFocus {
  readonly text: string;
  readonly repos?: readonly string[];
}

const ALWAYS = new Set(["company", "domain", "decision"]);
const STOP = new Set(["avec", "dans", "pour", "sans", "cette", "leur", "les", "des", "une", "est", "sur", "que", "qui", "the", "and", "for", "with"]);

export function selectNotes(notes: readonly Note[], focus: SelectionFocus, limits: SelectionLimits): Note[] {
  const words = [...new Set(tokens(focus.text))].filter((word) => word.length > 3 && !STOP.has(word));
  const repos = new Set((focus.repos ?? []).map((repo) => repo.toLowerCase()));
  const scored = notes
    .map((note) => ({ note, score: score(note, words, repos) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || a.note.path.localeCompare(b.note.path));
  const selected: Note[] = [];
  let lines = 0;
  for (const { note } of scored) {
    if (selected.length >= limits.maxNotes || lines + note.lines > limits.maxLines) continue;
    selected.push(note);
    lines += note.lines;
  }
  return selected;
}

export function renderNotes(notes: readonly Note[]): string {
  if (notes.length === 0) return "(la memoire ne dit rien de ce sujet)";
  return notes.map((note) => `### memory/${note.path} (${note.frontmatter.scope}, verifiee le ${note.frontmatter.last_verified})\n${note.body}`).join("\n\n");
}

function score(note: Note, words: readonly string[], repos: ReadonlySet<string>): number {
  const declared = (note.frontmatter.repos ?? []).map((repo) => String(repo).toLowerCase());
  const repoHit = declared.some((repo) => repos.has(repo)) || [...repos].some((repo) => note.path.startsWith(`repos/${repo}/`));
  const haystack = tokens(`${note.path} ${note.body}`);
  const wordHits = words.filter((word) => haystack.includes(word)).length;
  return (repoHit ? 10 : 0) + wordHits + (ALWAYS.has(note.frontmatter.scope) && wordHits > 0 ? 2 : 0);
}

function tokens(text: string): string[] {
  return text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
}
