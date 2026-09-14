import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { parse as parseYaml } from "yaml";
import { type LiveEvent, type PendingQuestion, parseEvent } from "./event.ts";

/**
 * L'etat du shell, en memoire, cote serveur.
 *
 * Le shell est une fenetre sur un run, pas un pilote. Il ne detient donc aucune
 * verite : tout ce qu'il affiche vient du flux d'events, et le flux est deja sur
 * disque avant d'arriver ici. S'il meurt, on le relance et il rejoue.
 */

type Subscriber = (payload: string) => void;

const events: LiveEvent[] = [];
const subscribers = new Set<Subscriber>();
const pending = new Map<string, { question: PendingQuestion; resolve: (answer: string) => void }>();
const ignored: { at: string; reason: string }[] = [];

let ticketId: string | null = process.env.AUTOPILOT_TICKET_ID ?? null;
let replayed = false;

function autopilotHome(): string {
  return process.env.AUTOPILOT_HOME ?? join(homedir(), ".autopilot");
}

/**
 * Le rejeu. Si `/autopilot-start` reprend un ticket interrompu, on doit pouvoir
 * arriver en cours de route et comprendre ce qui s'est passe — donc l'historique
 * complet, depuis le debut, avant de se brancher sur le direct.
 */
export function replay(): void {
  if (replayed || !ticketId) return;
  replayed = true;
  let raw = "";
  try {
    raw = readFileSync(join(autopilotHome(), "events", `${ticketId}.jsonl`), "utf8");
  } catch {
    return;
  }
  for (const line of raw.split("\n")) {
    if (!line.trim()) continue;
    try {
      const event = parseEvent(JSON.parse(line));
      if (event) events.push(event);
      else ignored.push({ at: new Date().toISOString(), reason: "event invalide au rejeu" });
    } catch {
      ignored.push({ at: new Date().toISOString(), reason: "ligne jsonl illisible" });
    }
  }
  events.sort((a, b) => a.seq - b.seq);
}

export function ingest(candidate: unknown): { accepted: boolean; reason?: string } {
  const event = parseEvent(candidate);
  if (!event) {
    const reason = "event invalide, ignore";
    ignored.push({ at: new Date().toISOString(), reason });
    // eslint-disable-next-line no-console
    console.warn("[live-shell]", reason, JSON.stringify(candidate)?.slice(0, 300));
    return { accepted: false, reason };
  }
  ticketId ??= event.ticketId;
  // Un event deja vu au rejeu ne doit pas apparaitre deux fois.
  if (!events.some((existing) => existing.runId === event.runId && existing.seq === event.seq)) {
    events.push(event);
  }
  broadcast("event", event);
  return { accepted: true };
}

/**
 * L'etat du ticket, lu sur disque a chaque appel.
 *
 * Le shell ne le detient pas et ne l'ecrit jamais : `write-store-ticket` en est
 * le seul ecrivain. Le relire a chaque fois evite d'entretenir ici une copie qui
 * derivera du fichier au premier crash.
 */
export function ticketState(): Record<string, unknown> | null {
  if (!ticketId) return null;
  try {
    return parseYaml(readFileSync(join(autopilotHome(), "tickets", `${ticketId}.yaml`), "utf8")) as Record<
      string,
      unknown
    >;
  } catch {
    return null;
  }
}

export function snapshot(): {
  ticketId: string | null;
  ticket: Record<string, unknown> | null;
  events: LiveEvent[];
  question: PendingQuestion | null;
  ignored: { at: string; reason: string }[];
} {
  replay();
  return {
    ticketId,
    ticket: ticketState(),
    events: [...events],
    question: [...pending.values()][0]?.question ?? null,
    ignored: [...ignored],
  };
}

export function subscribe(subscriber: Subscriber): () => void {
  subscribers.add(subscriber);
  return () => subscribers.delete(subscriber);
}

function broadcast(type: string, data: unknown): void {
  const payload = `event: ${type}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const subscriber of subscribers) {
    try {
      subscriber(payload);
    } catch {
      subscribers.delete(subscriber);
    }
  }
}

// --------------------------------------------------------------- ask-user ----

/**
 * `ask-user` bloque la session Claude : il depose la question et attend. C'est
 * volontaire, le workflow ne doit pas avancer pendant qu'il attend un arbitrage.
 * Le timeout et le repli terminal sont geres cote tool, pas ici.
 */
export function ask(question: Omit<PendingQuestion, "id" | "askedAt">): Promise<string> {
  const entry: PendingQuestion = {
    ...question,
    id: `q-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    askedAt: new Date().toISOString(),
  };
  return new Promise<string>((resolve) => {
    pending.set(entry.id, { question: entry, resolve });
    broadcast("question", entry);
  });
}

export function answer(id: string, value: string): boolean {
  const entry = pending.get(id);
  if (!entry) return false;
  pending.delete(id);
  entry.resolve(value);
  broadcast("answer", { id, answer: value });
  return true;
}

export function pendingQuestion(): PendingQuestion | null {
  return [...pending.values()][0]?.question ?? null;
}
