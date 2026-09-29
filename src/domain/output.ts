const FOCUS_CONTEXT = 2;

export function clip(text: string, keepLines: number): { text: string; truncated: boolean } {
  const lines = text.split("\n");
  if (lines.length <= keepLines * 2) return { text, truncated: false };
  const omitted = lines.length - keepLines * 2;
  return {
    text: [...lines.slice(0, keepLines), `… ${omitted} lignes coupees au milieu (journal complet sur disque) …`, ...lines.slice(-keepLines)].join("\n"),
    truncated: true,
  };
}

export function focusOn(text: string, pattern: string | undefined): { text: string; filtered: boolean; matched: number } {
  if (!pattern) return { text, filtered: false, matched: 0 };
  let regexp: RegExp;
  try {
    regexp = new RegExp(pattern, "i");
  } catch {
    return { text, filtered: false, matched: 0 };
  }
  const lines = text.split("\n");
  const kept = new Set<number>();
  let matched = 0;
  for (const [index, line] of lines.entries()) {
    if (!regexp.test(line)) continue;
    matched += 1;
    for (let offset = -FOCUS_CONTEXT; offset <= FOCUS_CONTEXT; offset += 1) {
      if (index + offset >= 0 && index + offset < lines.length) kept.add(index + offset);
    }
  }
  if (matched === 0) return { text, filtered: false, matched: 0 };
  const out: string[] = [];
  let previous = -1;
  for (const index of [...kept].sort((a, b) => a - b)) {
    if (previous !== -1 && index > previous + 1) out.push(`… ${index - previous - 1} lignes …`);
    out.push(lines[index] ?? "");
    previous = index;
  }
  return { text: out.join("\n"), filtered: true, matched };
}
