import * as v from "valibot";

/**
 * Le format d'event, valide cote app.
 *
 * Un event qu'on ne sait pas valider est logge et ignore, jamais affiche a
 * moitie : une ligne tronquee dans l'interface coute plus cher que son absence,
 * parce qu'on la croit.
 *
 * Ce schema est le miroir de celui du serveur de tools. Les deux doivent bouger
 * ensemble ; le test unitaire du LiveEvent garde les deux alignes.
 */

/**
 * Le payload est libre par kind, mais il traverse le reseau et le rendu serveur :
 * il doit donc etre serialisable. `unknown` laissait passer une Date ou une Map,
 * qui arrivaient cassees de l'autre cote sans que rien ne le dise.
 */
export type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

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
  title: v.pipe(v.string(), v.minLength(3), v.maxLength(200)),
  detail: v.nullable(v.string()),
  payload: v.custom<JsonValue>(() => true),
});

export type LiveEvent = v.InferOutput<typeof LiveEventSchema>;

export type LiveEventKind = (typeof LIVE_EVENT_KINDS)[number];

export function parseEvent(candidate: unknown): LiveEvent | null {
  const result = v.safeParse(LiveEventSchema, candidate);
  return result.success ? result.output : null;
}

/**
 * Une question du lot.
 *
 * Toujours des options proposees **et** un champ libre. Les options font que
 * l'arbitrage courant se tranche d'un clic ; le champ libre existe parce qu'un
 * agent qui propose quatre reponses peut passer a cote de la bonne, et qu'on ne
 * veut pas forcer l'humain a choisir la moins fausse.
 */
export interface AskQuestion {
  /** Cle stable, c'est elle qui rapporte la reponse a la question. */
  readonly key: string;
  /** Deux ou trois mots, affiches en etiquette. */
  readonly header: string;
  readonly question: string;
  readonly options: readonly string[];
}

/**
 * Un lot de questions, pose en une fois.
 *
 * `ask-user` bloque le workflow : poser trois questions l'une apres l'autre,
 * c'est trois arrets la ou un seul suffit. On groupe tout ce qui peut etre
 * demande au meme moment.
 */
export interface PendingQuestion {
  readonly id: string;
  readonly questions: readonly AskQuestion[];
  readonly askedBy: string | null;
  readonly askedAt: string;
}

/** Les 13 points du workflow, dans l'ordre. C'est l'ossature de l'interface. */
export const STEPS = [
  { id: "1", label: "Ticket" },
  { id: "2", label: "Maquettes" },
  { id: "3", label: "Memoire, large" },
  { id: "4", label: "Grill fonctionnel" },
  { id: "5", label: "Perimetre" },
  { id: "6", label: "Memoire, ciblee" },
  { id: "7", label: "Grill technique" },
  { id: "8", label: "Plan" },
  { id: "9", label: "Gate humain" },
  { id: "10", label: "Implementation" },
  { id: "11", label: "Plan memoire" },
  { id: "12", label: "Ecriture memoire" },
  { id: "13", label: "Publication" },
] as const;

/** `10.4` appartient au point 10. */
export function topLevelStep(step: string): string {
  return step.split(".")[0] ?? step;
}
