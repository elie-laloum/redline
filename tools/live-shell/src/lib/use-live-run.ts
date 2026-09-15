import { useCallback, useEffect, useMemo, useState } from "react";
import { type JsonValue, type LiveEvent, type PendingQuestion, parseEvent } from "./event.ts";
import { EMPTY_TICKET, type Ticket, readTicket } from "./ticket.ts";

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

  return { ...snapshot, ticket, ...derived, connection, connected: connection === "open", answer, reload };
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
  };
}
