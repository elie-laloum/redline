import { useEffect, useState } from "react";
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
    <span
      role="status"
      aria-label="en cours"
      className={cn(
        "spin-quiet size-3 shrink-0 rounded-full border-[1.5px] border-ink-faint/30 border-t-ink",
        className,
      )}
    />
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
  waiting: "bg-waiting",
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
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const started = Date.parse(since);
  if (Number.isNaN(started)) return null;

  return (
    <time dateTime={since} className={cn("font-mono tabular-nums", className)}>
      {format(Math.max(0, Math.round((now - started) / 1000)))}
    </time>
  );
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
