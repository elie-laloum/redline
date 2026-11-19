/** A checklist line the test writer declared it cannot cover with any declared test kind. */
export interface UncoverableLine {
  readonly id: string;
  readonly reason: string;
}

/** The human's answer to an `arbitrage` escalation on uncoverable lines, binding every later round and generation. */
export interface Ruling {
  /** The task that escalated, `<repo>.tests`. */
  readonly task: string;
  readonly lines: readonly UncoverableLine[];
  readonly ruling: string;
  readonly at: string;
}

const HEADER = "lignes que le registre ne permet pas de tester :";
const LINE = /^- (\S+) : (.*)$/;

export function uncoverableDetail(lines: readonly UncoverableLine[]): string {
  return [HEADER, ...lines.map((line) => `- ${line.id} : ${line.reason}`)].join("\n");
}

/** The lines an escalation detail written by `uncoverableDetail` declares; empty for any other detail. */
export function uncoverableLines(detail: string): UncoverableLine[] {
  const [header, ...rest] = detail.split("\n");
  if (header !== HEADER) return [];
  return rest.flatMap((line) => {
    const match = LINE.exec(line);
    return match?.[1] && match[2] !== undefined ? [{ id: match[1], reason: match[2] }] : [];
  });
}

export function ruledLines(rulings: readonly Ruling[], task: string): ReadonlySet<string> {
  return new Set(rulings.filter((entry) => entry.task === task).flatMap((entry) => entry.lines.map((line) => line.id)));
}

/** Empty when nothing was ruled, so the arbitrages read as they did before any escalation. */
export function renderRulings(rulings: readonly Ruling[]): string {
  if (rulings.length === 0) return "";
  const lines = rulings.flatMap((entry) => entry.lines.map((line) => `- ${line.id} (${entry.task}), declaree non couvrable : ${line.reason} → ${entry.ruling}`));
  return ["", "Arbitrages rendus par l'humain pendant la livraison — ils lient comme les autres ; une ligne arbitree ne se redeclare pas :", ...lines].join("\n");
}
