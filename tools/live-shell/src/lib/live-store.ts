import { readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { parse as parseYaml } from "yaml";
import {
  type AskQuestion,
  type JsonValue,
  type LiveEvent,
  type PendingPlan,
  type PendingQuestion,
  type PlanDecision,
  type PlanRepo,
  parseEvent,
} from "./event.ts";

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
/**
 * Un seul mecanisme de blocage, deux formes de chose en attente.
 *
 * Un lot de questions et un plan a approuver sont le meme moment du run : il
 * s'arrete et il attend quelqu'un. Ils partagent donc la meme table, le meme
 * retrait, le meme repli terminal — ouvrir un second canal aurait fait deux
 * mecaniques a tenir en phase pour une seule verite.
 */
type Waiting =
  | {
      kind: "questions";
      question: PendingQuestion;
      resolve: (answers: Record<string, string> | null) => void;
    }
  | { kind: "plan"; plan: PendingPlan; resolve: (decision: PlanDecision | null) => void };

const pending = new Map<string, Waiting>();
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
      else
        ignored.push({
          at: new Date().toISOString(),
          reason: "event invalide au rejeu",
        });
    } catch {
      ignored.push({
        at: new Date().toISOString(),
        reason: "ligne jsonl illisible",
      });
    }
  }
  events.sort((a, b) => a.seq - b.seq);
}

export function ingest(candidate: unknown): {
  accepted: boolean;
  reason?: string;
} {
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
export function ticketState(): JsonValue | null {
  if (!ticketId) return null;
  try {
    return parseYaml(readFileSync(join(autopilotHome(), "tickets", `${ticketId}.yaml`), "utf8")) as JsonValue;
  } catch {
    return null;
  }
}

export function snapshot(): {
  ticketId: string | null;
  ticket: JsonValue | null;
  events: LiveEvent[];
  question: PendingQuestion | null;
  plan: PendingPlan | null;
  ignored: { at: string; reason: string }[];
} {
  replay();
  return {
    ticketId,
    ticket: ticketState(),
    events: [...events],
    question: pendingQuestion(),
    plan: pendingPlan(),
    ignored: [...ignored],
  };
}

export function subscribe(subscriber: Subscriber): () => void {
  subscribers.add(subscriber);
  watchTicket();
  return () => subscribers.delete(subscriber);
}

/**
 * Le shell surveille l'etat du ticket lui-meme.
 *
 * Il ne le relisait que quand un event d'un certain kind passait — `step`,
 * `escalation`, `answer`. Les agents poussent surtout des `agent` et des
 * `tool`, alors la page restait sur la frame de son chargement : `run.step`
 * passait a 2 puis a 3 sur le disque pendant qu'elle affichait encore
 * « Lecture du ticket », sans que rien n'ait l'air casse.
 *
 * Faire dependre l'exactitude de la page de ce qu'un agent pense a pousser,
 * c'est faire du shell un point de defaillance de sa propre lecture. Le
 * fichier est la, il lui appartient, il le regarde. Un `stat` par seconde.
 */
let ticketWatch: ReturnType<typeof setInterval> | null = null;
let ticketStamp = "";

function watchTicket(): void {
  if (ticketWatch) return;
  ticketWatch = setInterval(() => {
    if (!ticketId) return;
    let stamp: string;
    try {
      const stat = statSync(join(autopilotHome(), "tickets", `${ticketId}.yaml`));
      stamp = `${stat.mtimeMs}:${stat.size}`;
    } catch {
      // Pas encore ecrit : il n'y a rien a diffuser, et ce n'est pas une panne.
      return;
    }
    if (stamp === ticketStamp) return;
    ticketStamp = stamp;
    broadcast("ticket", ticketState());
  }, 1000);
  // Le timer ne doit pas retenir le process : le shell se coupe avec son onglet.
  ticketWatch.unref?.();
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
export function ask(input: {
  questions: readonly AskQuestion[];
  askedBy: string | null;
  id?: string | null;
}): Promise<Record<string, string> | null> {
  const entry: PendingQuestion = {
    questions: input.questions,
    askedBy: input.askedBy,
    // L'appelant fournit l'identifiant : c'est lui qui devra retirer le lot
    // s'il se replie sur le terminal, et il ne peut pas le faire sans le
    // connaitre avant que la reponse arrive.
    id: input.id?.trim() || `q-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    askedAt: new Date().toISOString(),
    answerable: true,
  };
  return new Promise<Record<string, string> | null>((resolve) => {
    pending.set(entry.id, { kind: "questions", question: entry, resolve });
    broadcast("question", entry);
  });
}

/**
 * Le plan soumis au gate, par le meme chemin que les questions.
 *
 * Le point 9 passait par `ask-user` : cinq questions dont on avait oublie la
 * premiere en repondant a la derniere, pour valider un objet qui se lit sur une
 * page. Il a maintenant sa forme, et c'est la seule chose qui change — le
 * blocage, le retrait et le repli restent ceux qui ont deja tourne.
 */
export function askPlan(input: {
  repos: readonly PlanRepo[];
  note: string | null;
  askedBy: string | null;
  id?: string | null;
}): Promise<PlanDecision | null> {
  const entry: PendingPlan = {
    repos: input.repos,
    note: input.note,
    askedBy: input.askedBy,
    id: input.id?.trim() || `p-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    askedAt: new Date().toISOString(),
    answerable: true,
  };
  return new Promise<PlanDecision | null>((resolve) => {
    pending.set(entry.id, { kind: "plan", plan: entry, resolve });
    broadcast("plan", entry);
  });
}

/**
 * Le retrait d'un lot que l'appelant a repris ailleurs.
 *
 * `ask-user` attend un temps borne puis se replie sur le terminal. Sans ce
 * retrait, le lot restait affiche pour toujours : on repondait dans une page a
 * un run qui attendait deja la meme reponse dans un terminal, et le clic ne
 * resolvait qu'une promesse que plus personne n'ecoutait.
 */
export function withdraw(id: string): { withdrawn: boolean } {
  const entry = pending.get(id);
  if (!entry) return { withdrawn: false };
  pending.delete(id);
  entry.resolve(null);
  broadcast("withdraw", { id });
  return { withdrawn: true };
}

/**
 * Le verdict du gate.
 *
 * `amend` et `reject` exigent une note : un plan renvoye sans dire ce qui cloche
 * renvoie le planner sur la meme hypothese, et on recommence. `approve` n'en
 * demande pas — il n'y a rien a expliquer quand on dit oui.
 */
export function decide(id: string, decision: PlanDecision): { delivered: boolean; missing: boolean } {
  const entry = pending.get(id);
  if (!entry || entry.kind !== "plan") return { delivered: false, missing: false };
  if (decision.verdict !== "approve" && !decision.note.trim()) {
    return { delivered: false, missing: true };
  }

  pending.delete(id);
  entry.resolve(decision);
  broadcast("decision", { id, ...decision });
  return { delivered: true, missing: false };
}

/**
 * Le lot retrouve dans le journal, quand la memoire ne l'a plus.
 *
 * Un shell relance au milieu d'un lot doit quand meme montrer ce qui bloque le
 * run — sinon la page affiche un run au repos alors qu'il attend. Il le montre
 * en lecture seule : les questions sont vraies, le canal pour y repondre ne
 * l'est plus.
 */
function replayedQuestion(): PendingQuestion | null {
  const last = [...events].reverse().find((event) => event.kind === "question" || event.kind === "answer");
  if (!last || last.kind !== "question") return null;

  const payload = (last.payload ?? {}) as { questions?: AskQuestion[] };
  const questions = (payload.questions ?? []).filter((entry) => entry?.question);
  if (questions.length === 0) return null;

  return {
    id: `replayed-${last.seq}`,
    questions,
    askedBy: last.agent,
    askedAt: last.ts,
    answerable: false,
  };
}

/**
 * Le lot ne se rend que complet.
 *
 * Repondre a deux questions sur trois debloquerait le workflow sur une reponse
 * manquante, et l'agent repartirait sur une hypothese — exactement ce que le
 * blocage sert a empecher.
 */
export function answer(
  id: string,
  answers: Record<string, string>,
): { delivered: boolean; missing: string[] } {
  const entry = pending.get(id);
  if (!entry || entry.kind !== "questions") return { delivered: false, missing: [] };

  const missing = entry.question.questions
    .filter((question) => !answers[question.key]?.trim())
    .map((question) => question.key);
  if (missing.length > 0) return { delivered: false, missing };

  pending.delete(id);
  entry.resolve(answers);
  broadcast("answer", { id, answers });
  return { delivered: true, missing: [] };
}

export function pendingQuestion(): PendingQuestion | null {
  for (const entry of pending.values()) if (entry.kind === "questions") return entry.question;
  return replayedQuestion();
}

export function pendingPlan(): PendingPlan | null {
  for (const entry of pending.values()) if (entry.kind === "plan") return entry.plan;
  return replayedPlan();
}

/**
 * Le plan retrouve dans le journal, quand la memoire ne l'a plus.
 *
 * Meme raison que pour un lot de questions : un shell relance pendant le gate
 * doit montrer ce qui bloque, en lecture seule. Les boutons seraient un
 * mensonge — la promesse qui tient le workflow est morte avec l'ancien process.
 */
function replayedPlan(): PendingPlan | null {
  const last = [...events].reverse().find((event) => event.kind === "plan" || event.kind === "decision");
  if (!last || last.kind !== "plan") return null;

  const payload = (last.payload ?? {}) as { repos?: PlanRepo[]; note?: string };
  const repos = (payload.repos ?? []).filter((entry) => entry?.repo);
  if (repos.length === 0) return null;

  return {
    id: `replayed-${last.seq}`,
    repos,
    note: payload.note ?? null,
    askedBy: last.agent,
    askedAt: last.ts,
    answerable: false,
  };
}
