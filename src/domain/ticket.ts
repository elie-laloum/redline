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
