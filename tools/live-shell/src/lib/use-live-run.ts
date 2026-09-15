import { useCallback, useEffect, useMemo, useState } from "react";
import { type LiveEvent, type PendingQuestion, STEPS, parseEvent, topLevelStep } from "./event.ts";

export interface RunSnapshot {
  ticketId: string | null;
  ticket: TicketState | null;
  events: LiveEvent[];
  question: PendingQuestion | null;
  ignored: { at: string; reason: string }[];
}

export interface TicketState {
  ticket?: { key?: string; title?: string; statusAtStart?: string; url?: string };
  run?: { phase?: string; step?: string; currentRepo?: string; escalation?: Escalation | null };
  scope?: ScopeEntry[];
  metrics?: { humanInterventions?: number; loopTurnsTotal?: number; mrFeedbackCount?: number | null };
}

export interface ScopeEntry {
  name: string;
  level: number;
  status: "pending" | "in-progress" | "done" | "escalated";
  loops?: Record<string, number>;
}

export interface Escalation {
  at: string;
  step: string;
  repo: string | null;
  reason: string;
}

const EMPTY: RunSnapshot = { ticketId: null, ticket: null, events: [], question: null, ignored: [] };

/**
 * Une seule source pour l'interface : l'instantane au chargement, puis le SSE.
 *
 * A chaque reconnexion on redemande l'instantane complet plutot que d'essayer de
 * rattraper les events manques. `seq` est monotone : c'est ce qui permet de
 * detecter un trou, et un trou vaut un rechargement, pas un rafistolage.
 */
/**
 * Trois etats, pas deux.
 *
 * Avec un booleen, le rendu serveur — qui n'a evidemment pas encore de SSE —
 * affichait « deconnecte » en rouge sur la premiere frame d'un run qui se porte
 * bien. On ne crie au probleme qu'apres une vraie tentative ratee.
 */
export type Connection = "connecting" | "open" | "closed";

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
      // Les transitions d'etape changent l'etat du ticket sur disque.
      if (event.kind === "step" || event.kind === "escalation") void reload();
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

  const derived = useMemo(() => derive(snapshot), [snapshot]);

  return { ...snapshot, ...derived, connection, connected: connection === "open", answer, reload };
}

export interface Derived {
  /**
   * Le dernier event, quel que soit son kind : c'est **l'action en cours**.
   * Le bandeau ne montre rien d'autre — si on doit choisir entre plusieurs
   * sources pour dire « ou on en est », la derniere chose qui s'est passee est
   * la seule reponse qui ne ment jamais.
   */
  current: LiveEvent | null;
  /** Une action est en vol : le bandeau tourne. */
  busy: boolean;
  currentStep: string;
  currentTopStep: string;
  currentRepo: string | null;
  currentAgent: string | null;
  currentTool: string | null;
  loops: { name: string; count: number; budget: number | null }[];
  todos: { text: string; status: string }[];
  checklists: { agent: string; at: string; lines: string[] }[];
  messages: LiveEvent[];
  escalation: Escalation | null;
  stepIndex: number;
}

function derive(snapshot: RunSnapshot): Derived {
  const { events, ticket } = snapshot;
  const last = <T extends LiveEvent>(predicate: (event: LiveEvent) => boolean): T | null =>
    ([...events].reverse().find(predicate) as T) ?? null;

  const stepEvent = last((event) => event.kind === "step");
  const currentStep = ticket?.run?.step ?? (stepEvent?.payload as { step?: string } | null)?.step ?? "1";
  const currentTopStep = topLevelStep(currentStep);

  const agentEvent = last((event) => event.kind === "agent" && event.status !== "ok" && event.status !== "ko");
  const toolEvent = last((event) => event.kind === "tool");
  const todoEvent = last((event) => event.kind === "todo");

  const loopEvents = events.filter((event) => event.kind === "loop");
  const loops = new Map<string, { name: string; count: number; budget: number | null }>();
  for (const event of loopEvents) {
    const payload = (event.payload ?? {}) as { name?: string; count?: number; budget?: number };
    const name = payload.name ?? event.agent ?? "boucle";
    loops.set(name, { name, count: payload.count ?? 0, budget: payload.budget ?? null });
  }

  const checklists = events
    .filter((event) => Array.isArray((event.payload as { lines?: unknown } | null)?.lines))
    .map((event) => ({
      agent: event.agent ?? "adversaire",
      at: event.ts,
      lines: ((event.payload as { lines: unknown[] }).lines ?? []).map(String),
    }));

  const current = events.at(-1) ?? null;

  return {
    current,
    busy: current !== null && ["start", "progress", "waiting"].includes(current.status),
    currentStep,
    currentTopStep,
    currentRepo: ticket?.run?.currentRepo ?? stepEvent?.repo ?? null,
    currentAgent: agentEvent?.agent ?? null,
    currentTool: toolEvent?.tool ?? null,
    loops: [...loops.values()],
    todos: ((todoEvent?.payload as { todos?: { text: string; status: string }[] } | null)?.todos ?? []).map((todo) => ({
      text: String(todo.text),
      status: String(todo.status),
    })),
    checklists,
    messages: events.filter((event) => event.kind === "message"),
    escalation: ticket?.run?.escalation ?? null,
    stepIndex: STEPS.findIndex((step) => step.id === currentTopStep),
  };
}
