import { StateDot } from "#/components/atoms";
import { DOCKET_LABELS, type Ticket } from "#/lib/ticket";
import type { LoopCounter } from "#/lib/use-live-run";
import { cn } from "#/lib/utils";

/**
 * Ce que le rail portait et que la bande reprend sous `lg`.
 *
 * L'etape, sa duree et l'etat du run vivent maintenant dans le bandeau, a
 * toutes les largeurs — il n'y a plus qu'ici a les reprendre. Reste ce que le
 * bandeau ne dit pas et que le rail emportait en disparaissant : le perimetre,
 * les compteurs de boucle, et la derive.
 */

export interface StateStripProps {
  readonly ticket: Ticket;
  readonly loops: readonly LoopCounter[];
}

export function StateStrip({ ticket, loops }: StateStripProps) {
  return (
    <section
      aria-label="Périmètre et dérive"
      className="flex flex-wrap items-baseline gap-x-4 gap-y-1 border-b bg-rail px-6 py-2.5 text-[12px] text-ink-faint lg:hidden"
    >
      {ticket.scope.length > 0 ? (
        ticket.scope.map((repo) => (
          <span key={repo.name} className="flex items-baseline gap-1.5">
            <StateDot status={repo.status} />
            <span className="text-ink-soft">{repo.name}</span>
            {repo.level !== null ? <span>niveau {repo.level}</span> : null}
          </span>
        ))
      ) : (
        <span>Périmètre pas encore établi</span>
      )}

      {loops.map((loop) => {
        const spent = loop.budget !== null && loop.count >= loop.budget;
        const tight = loop.budget !== null && loop.count >= loop.budget - 1;
        return (
          <span key={loop.name} className="flex items-baseline gap-1.5">
            <span>{loop.name}</span>
            <span className={cn("font-mono tabular-nums", spent ? "text-ko" : tight ? "text-drift" : "")}>
              {loop.count}
              {loop.budget !== null ? `/${loop.budget}` : ""}
            </span>
          </span>
        );
      })}

      {/* La dérive suit la page partout : elle ne peut pas coûter un scroll. */}
      {ticket.contradictions.length > 0 ? (
        <span className="flex items-baseline gap-1.5 text-drift">
          <span>{DOCKET_LABELS.contradictions}</span>
          <span className="font-mono tabular-nums">{ticket.contradictions.length}</span>
        </span>
      ) : null}

      {ticket.metrics.humanInterventions !== null ? (
        <span className="flex items-baseline gap-1.5">
          <span>tes interventions</span>
          <span className="font-mono tabular-nums">{ticket.metrics.humanInterventions}</span>
        </span>
      ) : null}
    </section>
  );
}
