import { useCallback, useEffect, useMemo, useState } from "react";
import type { RunMark } from "../components/atoms.tsx";
import { type JsonValue, type LiveEvent, type PendingQuestion, parseEvent } from "./event.ts";
import { EMPTY_TICKET, STEPS, type Ticket, readTicket, stepIndex, topLevelStep } from "./ticket.ts";

export interface RunSnapshot {
  ticketId: string | null;
  /** L'etat du ticket, brut. Le shell le lit, il ne l'ecrit jamais. */
  ticket: JsonValue | null;
  events: LiveEvent[];
  question: PendingQuestion | null;
  ignored: { at: string; reason: string }[];
}

const EMPTY: RunSnapshot = { ticketId: null, ticket: null, events: [], question: null, ignored: [] };

/**
 * Trois etats, pas deux.
 *
 * Avec un booleen, le rendu serveur — qui n'a evidemment pas encore de SSE —
 * affichait « deconnecte » en rouge sur la premiere frame d'un run qui se porte
 * bien. On ne crie au probleme qu'apres une vraie tentative ratee.
 */
export type Connection = "connecting" | "open" | "closed";

export interface LoopCounter {
  readonly name: string;
  readonly count: number;
  readonly budget: number | null;
}

/**
 * Une seule source pour l'interface : l'instantane au chargement, puis le SSE.
 *
 * A chaque reconnexion on redemande l'instantane complet plutot que d'essayer
 * de rattraper les events manques. `seq` est monotone : c'est ce qui permet de
 * detecter un trou, et un trou vaut un rechargement, pas un rafistolage.
 */
export function useLiveRun(initial: RunSnapshot = EMPTY) {
  const [snapshot, setSnapshot] = useState<RunSnapshot>(initial);
  const [connection, setConnection] = useState<Connection>("connecting");

  const reload = useCallback(async () => {
    try {
      const response = await fetch("/rpc/state");
      if (response.ok) setSnapshot((await response.json()) as RunSnapshot);
    } catch {
      /* le SSE reprendra la main */
    }
  }, []);

  useEffect(() => {
    void reload();
    const source = new EventSource("/rpc/stream");

    source.addEventListener("open", () => setConnection("open"));
    source.addEventListener("error", () => setConnection("closed"));

    source.addEventListener("snapshot", (message) => {
      setConnection("open");
      setSnapshot(JSON.parse((message as MessageEvent).data) as RunSnapshot);
    });

    source.addEventListener("event", (message) => {
      const event = parseEvent(JSON.parse((message as MessageEvent).data));
      if (!event) return;
      setSnapshot((current) => {
        const known = current.events.some((existing) => existing.runId === event.runId && existing.seq === event.seq);
        return known ? current : { ...current, events: [...current.events, event] };
      });
      // Une transition d'etape change l'etat du ticket sur disque, donc le
      // dossier : c'est le seul moment ou il faut le relire.
      if (event.kind === "step" || event.kind === "escalation" || event.kind === "answer") void reload();
    });

    source.addEventListener("question", (message) => {
      setSnapshot((current) => ({
        ...current,
        question: JSON.parse((message as MessageEvent).data) as PendingQuestion,
      }));
    });

    source.addEventListener("answer", () => {
      setSnapshot((current) => ({ ...current, question: null }));
    });

    return () => source.close();
  }, [reload]);

  const answer = useCallback(async (id: string, answers: Record<string, string>) => {
    await fetch("/rpc/answer", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id, answers }),
    });
  }, []);

  const ticket = useMemo<Ticket>(
    () => (snapshot.ticket ? readTicket(snapshot.ticket) : EMPTY_TICKET),
    [snapshot.ticket],
  );

  const derived = useMemo(() => derive(snapshot.events), [snapshot.events]);
  const mark = useMemo(
    () => runMark(ticket, derived.current, snapshot.question),
    [ticket, derived.current, snapshot.question],
  );

  return {
    ...snapshot,
    ticket,
    ...derived,
    mark,
    connection,
    connected: connection === "open",
    answer,
    reload,
  };
}

/**
 * Un agent sous une etape.
 *
 * `speaking` distingue celui qui parle en ce moment de ceux qui sont
 * simplement encore ouverts — un orchestrateur reste ouvert pendant que le
 * developpeur travaille, et les faire pulser tous les deux mettrait deux
 * mouvements dans le rail pour une seule chose vivante.
 */
export type AgentState = "running" | "human" | "error" | "done";

export interface StepAgent {
  readonly name: string;
  readonly state: AgentState;
  readonly speaking: boolean;
}

export interface Derived {
  /** Le dernier event : ce qui se passe, la, maintenant. */
  readonly current: LiveEvent | null;
  readonly busy: boolean;
  readonly loops: readonly LoopCounter[];
  /**
   * Depuis quand l'etape courante dure — **son** debut, pas celui du run.
   *
   * Le rail affichait `run.startedAt`, donc il annoncait trois heures sur une
   * etape commencee il y a dix minutes. C'est precisement le signal de derive
   * qu'on voulait rendre, et il mentait.
   */
  readonly stepSince: string | null;
  /** Les agents de chaque etape, dans l'ordre ou ils ont pris la main. */
  readonly agents: ReadonlyMap<string, readonly StepAgent[]>;
}

function derive(events: readonly LiveEvent[]): Derived {
  const loops = new Map<string, LoopCounter>();
  for (const event of events) {
    if (event.kind !== "loop") continue;
    const payload = (event.payload ?? {}) as { name?: string; count?: number; budget?: number };
    const name = payload.name ?? event.agent ?? "boucle";
    loops.set(name, { name, count: payload.count ?? 0, budget: payload.budget ?? null });
  }

  const current = events.at(-1) ?? null;
  const lastStep = [...events].reverse().find((event) => event.kind === "step");

  return {
    current,
    busy: current !== null && ["start", "progress", "waiting"].includes(current.status),
    loops: [...loops.values()],
    stepSince: lastStep?.ts ?? null,
    agents: deriveAgents(events, current),
  };
}

const AGENT_STATE: Record<string, AgentState> = {
  start: "running",
  progress: "running",
  waiting: "human",
  ko: "error",
  ok: "done",
};

/**
 * Qui a pris la main sous chaque etape.
 *
 * L'etat d'un agent vient de son **dernier** event dans l'etape, quel qu'en
 * soit le kind : un agent qui pose une question via `ask-user` attend un
 * humain, meme si sa derniere prise de main disait « je demarre ». Un event
 * sans etape — tout l'historique d'avant l'estampille — n'est rattache nulle
 * part plutot que rattache au hasard.
 */
function deriveAgents(
  events: readonly LiveEvent[],
  current: LiveEvent | null,
): ReadonlyMap<string, readonly StepAgent[]> {
  const perStep = new Map<string, Map<string, AgentState>>();

  for (const event of events) {
    if (!event.step || !event.agent) continue;
    const step = topLevelStep(event.step);
    const seen = perStep.get(step) ?? new Map<string, AgentState>();
    // `set` sur une cle deja presente garde sa place d'insertion : l'ordre reste
    // celui des prises de main, l'etat est celui du dernier event.
    seen.set(event.agent, AGENT_STATE[event.status] ?? "done");
    perStep.set(step, seen);
  }

  const speaking = current?.agent ?? null;
  const out = new Map<string, readonly StepAgent[]>();
  for (const [step, seen] of perStep) {
    out.set(
      step,
      [...seen].map(([name, state]) => ({ name, state, speaking: name === speaking && state === "running" })),
    );
  }
  return out;
}

/**
 * L'etat du run, ramene a un seul signe.
 *
 * **L'ordre est la regle, pas une commodite d'ecriture.** Un run escalade
 * pendant qu'une question attendait encore doit montrer l'arret : c'est ce qui
 * decide si on vient repondre ou si on vient reprendre la main. L'inverse
 * enverrait quelqu'un taper une reponse dans un run qui ne tourne plus.
 *
 * Le flux SSE coupe n'apparait pas ici : c'est le shell qui va mal, pas le run,
 * et confondre les deux ferait mentir la page sur la seule chose qu'elle sait.
 */
export function runMark(
  ticket: Ticket,
  current: LiveEvent | null,
  question: PendingQuestion | null,
): RunMark {
  if (ticket.run.escalation !== null || current?.status === "ko") return "escalated";
  if (question !== null || current?.status === "waiting") return "human";
  if (current?.status === "start" || current?.status === "progress") return "running";
  // Sur la derniere etape, un `ok` clot le run. Ailleurs il clot une action, et
  // ce silence-la est un repos, pas une fin.
  if (current?.status === "ok" && stepIndex(ticket.run.step) === STEPS.length - 1) return "done";
  return "idle";
}
