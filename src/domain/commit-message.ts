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
  const subject = shorten(intent.subject.trim().replace(/\.$/, "").replace(/^\w/, (c) => c.toLowerCase()), MAX_HEADER - prefix.length);
  const parts = [`${prefix}${subject}`];
  if (intent.body?.trim()) parts.push("", intent.body.trim());
  parts.push("", `Refs: ${ticket}`);
  return parts.join("\n");
}

function shorten(subject: string, room: number): string {
  if (subject.length <= room) return subject;
  const cut = subject.slice(0, room);
  const space = cut.lastIndexOf(" ");
  return (space > room / 2 ? cut.slice(0, space) : cut).trimEnd();
}
