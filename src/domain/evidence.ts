export interface Evidence {
  readonly file: string;
  readonly line: number;
}

export function parseEvidence(reference: string): Evidence | null {
  const match = /^\s*([^\s:][^:]*?):(\d+)(?::\d+)?\b/.exec(reference);
  if (!match?.[1] || !match[2]) return null;
  return { file: match[1], line: Number(match[2]) };
}
