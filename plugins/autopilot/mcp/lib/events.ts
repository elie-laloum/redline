import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import * as v from "valibot";
import { autopilotHome, eventsPath } from "./paths.ts";

/**
 * Un seul format d'event pour tout le monde. Un event qu'on ne sait pas valider
 * est logge et ignore, jamais affiche a moitie : une interface qui montre une
 * ligne tronquee est pire qu'une interface qui n'en montre pas.
 */

export const LIVE_EVENT_KINDS = [
  "step",
  "agent",
  "tool",
  "loop",
  "todo",
  "question",
  "answer",
  "escalation",
  "message",
] as const;

export const LIVE_EVENT_STATUSES = ["start", "progress", "ok", "ko", "waiting"] as const;

export const LiveEventSchema = v.object({
  runId: v.pipe(v.string(), v.minLength(1)),
  ticketId: v.pipe(v.string(), v.minLength(1)),
  seq: v.pipe(v.number(), v.integer(), v.minValue(0)),
  ts: v.pipe(v.string(), v.isoTimestamp()),
  kind: v.picklist(LIVE_EVENT_KINDS),
  status: v.picklist(LIVE_EVENT_STATUSES),
  repo: v.nullable(v.string()),
  agent: v.nullable(v.string()),
  tool: v.nullable(v.string()),
  // `title` doit se lire sans contexte : c'est ce qui s'affiche. Un agent qui
  // pousse « en cours » a rate son event, d'ou la longueur minimale.
  title: v.pipe(v.string(), v.minLength(3), v.maxLength(200)),
  detail: v.nullable(v.string()),
  payload: v.unknown(),
});

export type LiveEvent = v.InferOutput<typeof LiveEventSchema>;

export function validateEvent(candidate: unknown): { ok: true; event: LiveEvent } | { ok: false; issues: string[] } {
  const result = v.safeParse(LiveEventSchema, candidate);
  if (result.success) return { ok: true, event: result.output };
  return { ok: false, issues: result.issues.map((issue) => `${issue.path?.map((p) => String(p.key)).join(".") ?? "?"} : ${issue.message}`) };
}

// --------------------------------------------------------- session live ----

export interface LiveSession {
  readonly runId: string;
  readonly ticketId: string;
  readonly port: number;
  readonly url: string;
  readonly pid: number;
  readonly startedAt: string;
}

export function liveSessionPath(ticketId: string): string {
  return join(autopilotHome(), "live", `${ticketId}.json`);
}

export function readLiveSession(ticketId: string): LiveSession | null {
  try {
    return JSON.parse(readFileSync(liveSessionPath(ticketId), "utf8")) as LiveSession;
  } catch {
    return null;
  }
}

export function writeLiveSession(session: LiveSession): void {
  const path = liveSessionPath(session.ticketId);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(session, null, 2)}\n`, "utf8");
}

// ----------------------------------------------------------- persistance ----

/**
 * Les events sont d'abord appendus sur disque, ensuite pousses au shell. Cet
 * ordre est la seule raison pour laquelle le live shell n'est pas un point de
 * defaillance : s'il est mort, le run continue et l'historique reste complet,
 * et une reprise peut rejouer depuis le debut.
 */
export function appendEvent(event: LiveEvent): void {
  const path = eventsPath(event.ticketId);
  mkdirSync(dirname(path), { recursive: true });
  appendFileSync(path, `${JSON.stringify(event)}\n`, "utf8");
}

export function readEvents(ticketId: string): LiveEvent[] {
  let raw = "";
  try {
    raw = readFileSync(eventsPath(ticketId), "utf8");
  } catch {
    return [];
  }
  const events: LiveEvent[] = [];
  for (const line of raw.split("\n")) {
    if (!line.trim()) continue;
    try {
      const parsed = validateEvent(JSON.parse(line));
      if (parsed.ok) events.push(parsed.event);
    } catch {
      // Ligne illisible : on l'ignore plutot que de casser le rejeu complet.
    }
  }
  return events;
}

export function nextSeq(ticketId: string): number {
  const events = readEvents(ticketId);
  const last = events.at(-1);
  return last ? last.seq + 1 : 0;
}

/** Best effort, et strictement best effort : une diffusion ratee n'echoue jamais. */
export async function broadcast(event: LiveEvent, timeoutMs = 2000): Promise<"sent" | "no-session" | "unreachable"> {
  const session = readLiveSession(event.ticketId);
  if (!session) return "no-session";
  try {
    const response = await fetch(`${session.url}/rpc/event`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(event),
      signal: AbortSignal.timeout(timeoutMs),
    });
    return response.ok ? "sent" : "unreachable";
  } catch {
    return "unreachable";
  }
}
