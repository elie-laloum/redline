import { Elapsed, Spinner, StateDot } from "#/components/atoms";
import { STEPS, type Ticket, stepIndex } from "#/lib/ticket";
import type { LoopCounter } from "#/lib/use-live-run";
import { cn } from "#/lib/utils";

/**
 * L'etat, en une bande, quand le rail ne tient pas.
 *
 * Sous `lg` le rail disparait — et avec lui l'etape, la duree, le perimetre et
 * les compteurs. Une page dont le premier travail est de dire l'etat ne peut pas
 * se permettre de le perdre a 390px : la bande reprend le strict necessaire.
 */

export interface StateStripProps {
  readonly ticket: Ticket;
  readonly loops: readonly LoopCounter[];
  readonly stepSince: string | null;
}

export function StateStrip({ ticket, loops, stepSince }: StateStripProps) {
  const here = stepIndex(ticket.run.step);
  const step = here >= 0 ? STEPS[here] : null;

  return (
    <section
      aria-label="Etat du run"
      className="flex flex-col gap-2 border-b bg-rail px-6 py-3 text-rail-ink lg:hidden"
    >
      <div className="flex items-baseline gap-2">
        {ticket.url && ticket.key ? (
          <a href={ticket.url} className="font-mono text-[13px] font-medium hover:underline">
            {ticket.key}
          </a>
        ) : null}
        <p className="min-w-0 flex-1 truncate text-[13px] text-ink-soft">{ticket.title ?? "—"}</p>
      </div>

      <div className="flex items-center gap-2 text-[13px]">
        <Spinner />
        <span className="font-mono text-[11px] tabular-nums text-ink-faint">
          {ticket.run.step}
          <span className="sr-only"> sur 13</span>
        </span>
        <span className="min-w-0 flex-1 truncate font-medium">{step?.label ?? "En attente"}</span>
        {stepSince ? <Elapsed since={stepSince} className="shrink-0 text-[12px] text-ink-faint" /> : null}
      </div>

      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 text-[12px] text-ink-faint">
        {ticket.scope.map((repo) => (
          <span key={repo.name} className="flex items-baseline gap-1.5">
            <StateDot status={repo.status} />
            <span className="text-ink-soft">{repo.name}</span>
            {repo.level !== null ? <span className="font-mono tabular-nums">L{repo.level}</span> : null}
          </span>
        ))}

        {loops.map((loop) => {
          const spent = loop.budget !== null && loop.count >= loop.budget;
          const tight = loop.budget !== null && loop.count >= loop.budget - 1;
          return (
            <span key={loop.name} className="flex items-baseline gap-1.5">
              <span>{loop.name}</span>
              <span className={cn("font-mono tabular-nums", spent ? "text-ko" : tight ? "text-waiting" : "")}>
                {loop.count}
                {loop.budget !== null ? `/${loop.budget}` : ""}
              </span>
            </span>
          );
        })}

        {ticket.metrics.humanInterventions !== null ? (
          <span className="flex items-baseline gap-1.5">
            <span>interventions</span>
            <span className="font-mono tabular-nums">{ticket.metrics.humanInterventions}</span>
          </span>
        ) : null}
      </div>
    </section>
  );
}
