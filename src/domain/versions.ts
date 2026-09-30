import { fill } from "./naming.ts";

const DEV_VERSION = /^(?<base>.+?)-(?<ticket>[A-Za-z][A-Za-z0-9_]*-\d+)-(?<n>\d+)$/;

export interface DevVersion {
  readonly base: string;
  readonly ticket: string;
  readonly n: number;
}

export function parseDevVersion(tag: string): DevVersion | null {
  const groups = DEV_VERSION.exec(tag)?.groups;
  if (!groups?.base || !groups.ticket || !groups.n) return null;
  return { base: groups.base, ticket: groups.ticket, n: Number(groups.n) };
}

export function nextDevVersion(base: string, ticket: string, existingTags: readonly string[], suffix = "-{n}"): string {
  const highest = existingTags
    .map(parseDevVersion)
    .filter((tag): tag is DevVersion => tag !== null && tag.base === base && tag.ticket.toUpperCase() === ticket.toUpperCase())
    .reduce((max, tag) => Math.max(max, tag.n), 0);
  return `${base}-${ticket}${fill(suffix, { n: String(highest + 1) })}`;
}
