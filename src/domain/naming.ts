import type { Settings } from "./config.ts";
import { fail } from "./failure.ts";

type Naming = Settings["naming"];

export interface NameParts {
  readonly type: string;
  readonly ticket: string;
  readonly title: string;
}

const DIACRITICS = /[̀-ͯ]/g;

export function slugify(title: string, maxLength: number): string {
  const slug = title
    .normalize("NFD")
    .replace(DIACRITICS, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (slug.length <= maxLength) return slug;
  const cut = slug.slice(0, maxLength);
  const lastDash = cut.lastIndexOf("-");
  return (lastDash > maxLength / 2 ? cut.slice(0, lastDash) : cut).replace(/-+$/g, "");
}

export function typeFromIssueType(naming: Naming, issueType: string): string {
  return naming.typeFromJiraIssueType[issueType] ?? naming.typeFromJiraIssueType.default ?? "task";
}

export function branchName(naming: Naming, parts: NameParts): string {
  return fill(naming.branch, values(naming, parts));
}

export function mergeRequestName(naming: Naming, parts: NameParts, draft: boolean): string {
  const name = fill(naming.mergeRequest, { ...values(naming, parts), titre: parts.title.trim() });
  return draft ? `Draft: ${name}` : name;
}

export function slackChannelName(naming: Naming, parts: Pick<NameParts, "ticket" | "title">): string {
  return fill(naming.slackChannel, values(naming, { ...parts, type: "" }))
    .toLowerCase()
    .normalize("NFD")
    .replace(DIACRITICS, "")
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80)
    .replace(/-+$/g, "");
}

function values(naming: Naming, parts: NameParts): Record<string, string> {
  if (parts.type && !naming.types.includes(parts.type)) {
    fail(`Type de branche inconnu : ${parts.type}.`, `Types autorises : ${naming.types.join(", ")}`);
  }
  return { type: parts.type, ticket: parts.ticket, slug: slugify(parts.title, naming.slugMaxLength), titre: parts.title };
}

export function fill(template: string, entries: Readonly<Record<string, string>>): string {
  return template.replace(/\{(\w+)\}/g, (whole, key: string) => entries[key] ?? whole);
}
