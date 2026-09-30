import { fail } from "./failure.ts";

export interface Criterion {
  readonly id: string;
  readonly text: string;
}

export interface TicketSnapshot {
  readonly key: string;
  readonly squad: string;
  readonly title: string;
  readonly description: string;
  readonly criteria: readonly Criterion[];
  readonly issueType: string;
  readonly status: string;
  readonly url: string;
  readonly labels: readonly string[];
  readonly links: readonly string[];
  /** Tickets it points to: parent, subtasks, formal links, and /browse/ URLs of the same site. */
  readonly references: readonly TicketReference[];
  /** The references, read once the ticket is framed; empty straight out of the tracker. */
  readonly related: readonly RelatedTicket[];
}

export interface TicketReference {
  readonly key: string;
  /** How the ticket relates to it, as Jira words it: parent, "blocks", "is cloned by"... */
  readonly relation: string;
}

export type RelatedTicket =
  | (TicketReference & { readonly title: string; readonly issueType: string; readonly status: string; readonly url: string; readonly description: string })
  | (TicketReference & { readonly unavailable: string });

export interface ReferenceSources {
  readonly key: string;
  readonly site: string;
  readonly parent?: { readonly key?: string } | undefined;
  readonly subtasks?: readonly { readonly key?: string }[] | undefined;
  readonly issuelinks?:
    | readonly {
        readonly type?: { readonly inward?: string; readonly outward?: string };
        readonly inwardIssue?: { readonly key?: string };
        readonly outwardIssue?: { readonly key?: string };
      }[]
    | undefined;
  readonly links: readonly string[];
}

const MAX_REFERENCES = 15;
const BROWSE = /^\/browse\/([A-Za-z][A-Za-z0-9_]*-\d+)\/?$/;

export function referencesOf(sources: ReferenceSources): readonly TicketReference[] {
  const found: TicketReference[] = [];
  const add = (key: string | undefined, relation: string) => {
    const normalized = key?.trim().toUpperCase();
    if (normalized && normalized !== sources.key && !found.some((reference) => reference.key === normalized)) found.push({ key: normalized, relation });
  };
  add(sources.parent?.key, "parent");
  for (const subtask of sources.subtasks ?? []) add(subtask.key, "sous-tache");
  for (const link of sources.issuelinks ?? []) {
    if (link.outwardIssue) add(link.outwardIssue.key, link.type?.outward ?? "lie");
    if (link.inwardIssue) add(link.inwardIssue.key, link.type?.inward ?? "lie");
  }
  const host = hostOf(sources.site);
  for (const link of sources.links) {
    const url = parseUrl(link);
    if (url && url.host === host) add(BROWSE.exec(url.pathname)?.[1], "cite dans la description");
  }
  return found.slice(0, MAX_REFERENCES);
}

function parseUrl(text: string): URL | null {
  try {
    return new URL(text);
  } catch {
    return null;
  }
}

function hostOf(site: string): string | null {
  return parseUrl(site)?.host ?? null;
}

const KEY = /^([A-Za-z][A-Za-z0-9_]*)-\d+$/;

export function squadOf(ticketKey: string): string {
  const match = KEY.exec(ticketKey.trim());
  if (!match?.[1]) fail(`Cle Jira mal formee : ${ticketKey}.`, "Attendu <PROJET>-<numero>, par exemple FT-1025.");
  return match[1].toUpperCase();
}

export function normalizeKey(input: string): string {
  const fromUrl = /\/browse\/([A-Za-z][A-Za-z0-9_]*-\d+)/.exec(input);
  const key = (fromUrl?.[1] ?? input).trim().toUpperCase();
  squadOf(key);
  return key;
}

export function titleDrift(frozen: Pick<TicketSnapshot, "title">, current: Pick<TicketSnapshot, "title">): boolean {
  return frozen.title.trim() !== current.title.trim();
}
