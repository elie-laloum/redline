import { useEffect, useState } from "react";
import type { LiveEvent } from "#/lib/event";
import type { Connection } from "#/lib/use-live-run";
import { cn } from "#/lib/utils";

/**
 * Le bandeau d'action.
 *
 * Toujours visible, colle en haut. Il repond a une seule question, celle qu'on
 * se pose en arrivant devant l'ecran : **qu'est-ce qui se passe, la, maintenant ?**
 *
 * Il ne montre donc que le dernier event — l'etape, le titre, qui le fait — et
 * un loader qui tourne tant que l'action est en vol. Un run de trois heures doit
 * rester comprehensible en dix secondes de lecture, et ca commence par ne pas
 * avoir a chercher ou regarder.
 */

export interface ActionBarProps {
  readonly current: LiveEvent | null;
  readonly busy: boolean;
  readonly step: string;
  readonly repo: string | null;
  readonly connection: Connection;
}

export function ActionBar({ current, busy, step, repo, connection }: ActionBarProps) {
  const elapsed = useElapsed(current?.ts ?? null);
  const status = current?.status ?? "progress";

  return (
    <div
      className="sticky z-30 -mx-4 mb-1 border-b bg-background/85 px-4 py-2.5 backdrop-blur sm:-mx-6 sm:px-6"
      style={{ top: 0 }}
    >
      <div className="mx-auto flex max-w-5xl items-center gap-3">
        <Indicator busy={busy} status={status} connection={connection} />

        <span
          className={cn(
            "shrink-0 rounded-md px-1.5 py-0.5 text-[11px] font-medium leading-none tabular-nums",
            busy ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
          )}
        >
          {step}
        </span>

        {repo ? (
          <span className="hidden shrink-0 rounded-md border px-1.5 py-0.5 text-[11px] leading-none text-muted-foreground sm:inline">
            {repo}
          </span>
        ) : null}

        <p className="min-w-0 flex-1 truncate text-sm" title={current?.title ?? undefined}>
          {current?.title ?? "En attente du premier event du run"}
        </p>

        <span className="hidden shrink-0 text-xs text-muted-foreground md:inline">
          {[current?.agent, current?.tool].filter(Boolean).join(" · ")}
        </span>

        {elapsed ? (
          <span className="shrink-0 tabular-nums text-xs text-muted-foreground">{elapsed}</span>
        ) : null}
      </div>
    </div>
  );
}

function Indicator({ busy, status, connection }: { busy: boolean; status: string; connection: Connection }) {
  // Une connexion perdue prime sur tout : ce qui est affiche n'est plus a jour.
  if (connection === "closed") {
    return (
      <span className="size-4 shrink-0 rounded-full border-2 border-ko/40 border-t-ko" title="deconnecte du flux" />
    );
  }
  if (busy || connection === "connecting") {
    return (
      <span
        className="size-4 shrink-0 animate-spin rounded-full border-2 border-muted-foreground/25 border-t-primary"
        role="status"
        aria-label="action en cours"
      />
    );
  }
  const tone = status === "ko" ? "text-ko" : status === "waiting" ? "text-waiting" : "text-ok";
  const glyph = status === "ko" ? "✕" : status === "waiting" ? "⏸" : "✓";
  return (
    <span className={cn("size-4 shrink-0 text-center text-[13px] leading-4", tone)} aria-label={status}>
      {glyph}
    </span>
  );
}

/**
 * Le temps ecoule depuis le debut de l'action courante. Il avance tout seul :
 * une action figee depuis quatre minutes doit se voir sans avoir a comparer deux
 * horodatages.
 */
function useElapsed(since: string | null): string | null {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!since) return;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [since]);

  if (!since) return null;
  const started = Date.parse(since);
  if (Number.isNaN(started)) return null;

  const seconds = Math.max(0, Math.round((now - started) / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ${String(seconds % 60).padStart(2, "0")}s`;
  return `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, "0")}m`;
}
