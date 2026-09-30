export const COMMIT_TYPES = ["feat", "fix", "refactor", "test", "docs", "chore", "style", "perf", "build", "ci"] as const;
export type CommitType = (typeof COMMIT_TYPES)[number];

export interface CommitIntent {
  readonly type: CommitType;
  readonly scope?: string | null;
  readonly subject: string;
  readonly body?: string | null;
}

const MAX_HEADER = 72;

export function buildCommitMessage(intent: CommitIntent, ticket: string): string {
  const prefix = `${intent.type}${intent.scope ? `(${intent.scope})` : ""}: `;
  const full = intent.subject.trim().replace(/\.$/, "").replace(/^\w/, (c) => c.toLowerCase());
  const subject = shorten(full, MAX_HEADER - prefix.length);
  const parts = [`${prefix}${subject}`];
  const body = [subject === full ? "" : `${full}.`, intent.body?.trim() ?? ""].filter(Boolean).join("\n\n");
  if (body) parts.push("", body);
  parts.push("", `Refs: ${ticket}`);
  return parts.join("\n");
}

function shorten(subject: string, room: number): string {
  if (subject.length <= room) return subject;
  const words = subject.slice(0, room + 1).split(" ");
  return (words.length > 1 ? words.slice(0, -1).join(" ") : subject.slice(0, room)).replace(/[\s,;:-]+$/, "");
}
