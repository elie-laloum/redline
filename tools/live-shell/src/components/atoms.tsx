import { useEffect, useState } from "react";
import type { AgentState } from "#/lib/use-live-run";
import { cn } from "#/lib/utils";

/**
 * Les quelques primitives de la page.
 *
 * Pas de carte, pas de conteneur generique : le dossier est fait de filets et
 * de texte courant. Ce qui reste ici, c'est ce qui porte de l'etat.
 */

/** La seule motion continue de la page. */
export function Spinner({ className }: { className?: string }) {
  return (
    <output
      aria-label="en cours"
      className={cn(
        "spin-quiet block size-3 shrink-0 rounded-full border-[1.5px] border-ink-faint/30 border-t-ink",
        className,
      )}
    />
  );
}

/**
 * Ou en est le run, en un seul signe.
 *
 * Cinq etats qui s'excluent, et l'ordre de priorite fait partie de la regle :
 * un run escalade pendant qu'une question trainait montre l'arret, pas
 * l'attente. Le detail de ce classement vit dans `runMark`.
 *
 * Il tourne quand un agent travaille, il s'arrete quand c'est a toi. C'est la
 * distinction la plus utile de la page, et elle se lit sans connaitre le code
 * couleur : ca bouge ou ca ne bouge pas.
 */
export type RunMark = "running" | "human" | "escalated" | "done" | "idle";

const MARK: Record<Exclude<RunMark, "running">, { tone: string; label: string }> = {
  human: { tone: "bg-human", label: "en attente de ta reponse" },
  escalated: { tone: "bg-ko", label: "arrete" },
  done: { tone: "bg-ok", label: "termine" },
  idle: { tone: "bg-ink-faint/50", label: "au repos" },
};

export function StateMark({ mark, className }: { mark: RunMark; className?: string }) {
  // Meme encombrement que le spinner : changer d'etat ne doit pas decaler la
  // ligne, sinon on croit que le texte a bouge.
  if (mark === "running") return <Spinner className={className} />;

  const { tone, label } = MARK[mark];
  return (
    <output className={cn("flex size-3 shrink-0 items-center justify-center", className)}>
      <span aria-hidden className={cn("size-2.5 rounded-full", tone)} />
      <span className="sr-only">{label}</span>
    </output>
  );
}

/**
 * Un agent sous son etape.
 *
 * Le vert dit « vivant », pas « reussi » — au niveau du run c'est l'inverse, et
 * les deux ne peuvent pas se croiser : quand le run est termine, plus aucun
 * agent ne tourne. La pulsation les separe de toute facon, l'une bouge et
 * l'autre non.
 *
 * Seul celui qui parle en ce moment pulse. Les autres agents ouverts restent
 * verts et immobiles : ils sont vivants, ils ne sont pas en train d'agir.
 */
const AGENT: Record<AgentState, { tone: string; label: string }> = {
  running: { tone: "bg-ok", label: "au travail" },
  human: { tone: "bg-human", label: "en attente de ta reponse" },
  error: { tone: "bg-ko", label: "en echec" },
  done: { tone: "bg-ink-faint/50", label: "a rendu" },
};

export function AgentDot({ state, speaking }: { state: AgentState; speaking: boolean }) {
  const { tone, label } = AGENT[state];
  return (
    <span className="flex size-3 shrink-0 items-center justify-center">
      <span aria-hidden className={cn("size-2 rounded-full", tone, speaking && "pulse-quiet")} />
      <span className="sr-only">{label}</span>
    </span>
  );
}

/** Le seul signe dessiné de la page : fermé à droite, ouvert en bas. */
export function Caret({ open, className }: { open: boolean; className?: string }) {
  return (
    <svg
      viewBox="0 0 12 12"
      role="img"
      aria-label={open ? "replier" : "déplier"}
      className={cn("size-3 shrink-0 transition-transform", open && "rotate-90", className)}
    >
      <path
        d="M4.5 2.5 8 6l-3.5 3.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

const TONE: Record<string, string> = {
  done: "bg-ok",
  success: "bg-ok",
  passed: "bg-ok",
  ok: "bg-ok",
  confirmee: "bg-ok",
  "in-progress": "bg-ink",
  running: "bg-ink",
  escalated: "bg-ko",
  failed: "bg-ko",
  ko: "bg-ko",
  pending: "bg-ink-faint/50",
  todo: "bg-ink-faint/50",
  waiting: "bg-human",
};

/** Un etat se lit a la couleur **et** au mot : la pastille seule ne suffit pas. */
export function StateDot({ status, className }: { status: string; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn("size-1.5 shrink-0 rounded-full", TONE[status] ?? "bg-ink-faint/50", className)}
    />
  );
}

export function statusTone(status: string): string {
  if (["passed", "done", "success", "ok", "confirmee"].includes(status)) return "text-ok";
  if (["failed", "escalated", "ko", "infirmee"].includes(status)) return "text-ko";
  if (["waiting", "pending", "todo"].includes(status)) return "text-ink-faint";
  return "text-ink-soft";
}

/**
 * Le temps ecoule, qui avance tout seul.
 *
 * C'est la seule facon dont la page rend une derive temporelle : elle ne
 * connait pas la duree normale d'une etape, donc elle montre la duree en cours
 * assez fort pour que vingt minutes se remarquent.
 */
export function Elapsed({ since, className }: { since: string; className?: string }) {
  const now = useNow();
  const started = Date.parse(since);
  if (Number.isNaN(started)) return null;

  return (
    <time dateTime={since} className={cn("font-mono tabular-nums", className)}>
      {format(Math.max(0, Math.round((now - started) / 1000)))}
    </time>
  );
}

/**
 * L'horloge de la page, une seule pour tout le monde.
 *
 * Le rendu serveur n'a pas la meme heure que l'onglet : on ne lit `Date.now()`
 * qu'apres le montage, sinon la premiere seconde affiche un ecart qui n'existe
 * pas.
 */
export function useNow(): number {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  return now;
}

function format(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  return `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, "0")}`;
}

/** Un horodatage absolu, quand c'est le moment qui compte et pas la duree. */
export function At({ iso, className }: { iso: string; className?: string }) {
  const parsed = Date.parse(iso);
  if (Number.isNaN(parsed)) return null;
  return (
    <time dateTime={iso} className={cn("font-mono tabular-nums", className)}>
      {new Date(parsed).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
    </time>
  );
}

/**
 * Un vide qui dit quelque chose.
 *
 * Une memoire muette, un perimetre pas encore etabli, une checklist non rendue :
 * chacun est une information sur l'avancement, pas un trou a masquer.
 */
export function Nothing({ children }: { children: React.ReactNode }) {
  return <p className="text-[13px] leading-relaxed text-ink-faint">{children}</p>;
}
