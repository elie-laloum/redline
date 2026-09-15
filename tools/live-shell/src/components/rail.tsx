import { STEPS, type DocketSection, type Metrics, type RepoEntry, type Ticket, stepIndex } from "#/lib/ticket";
import { cn } from "#/lib/utils";
import { Elapsed, Spinner, StateDot } from "#/components/atoms";

/**
 * Le rail.
 *
 * Il porte l'etat — l'etape, sa duree, les depots, les compteurs — **et** il
 * sert de sommaire au dossier : choisir un point filtre la colonne de droite
 * sur ce que ce point a decide. C'est ce qui fait que mener par les decisions
 * ne coute pas l'etat.
 */

export interface RailProps {
  readonly ticket: Ticket;
  readonly loops: readonly { name: string; count: number; budget: number | null }[];
  /** Debut de l'etape courante. Distinct du debut du run. */
  readonly stepSince: string | null;
  readonly selected: DocketSection | null;
  readonly onSelect: (section: DocketSection | null) => void;
}

export function Rail({ ticket, loops, stepSince, selected, onSelect }: RailProps) {
  const { run } = ticket;
  const here = stepIndex(run.step);

  return (
    <nav aria-label="Avancement du run" className="flex h-full flex-col gap-6 overflow-y-auto px-4 py-5">
      <Identity ticket={ticket} />

      <ol className="flex flex-col">
        {STEPS.map((step, index) => {
          const state = here < 0 ? "todo" : index < here ? "done" : index === here ? "now" : "todo";
          const section = step.docket as DocketSection | null;
          const reachable = section !== null && hasSection(ticket, section);
          const active = section !== null && selected === section;

          return (
            <li key={step.id}>
              <StepRow
                id={step.id}
                label={step.label}
                detail={index === here ? detailOf(run.step, run.currentRepo) : null}
                since={index === here ? stepSince : null}
                state={state}
                reachable={reachable}
                active={active}
                onSelect={() => onSelect(active ? null : section)}
              />
            </li>
          );
        })}
      </ol>

      {loops.length > 0 ? <Loops loops={loops} /> : null}
      <Scope repos={ticket.scope} current={run.currentRepo} />
      <Counters metrics={ticket.metrics} />
    </nav>
  );
}

function Identity({ ticket }: { ticket: Ticket }) {
  return (
    <header className="flex flex-col gap-1.5">
      <div className="flex items-baseline gap-2">
        {ticket.url && ticket.key ? (
          <a href={ticket.url} className="font-mono text-[13px] font-medium hover:underline">
            {ticket.key}
          </a>
        ) : (
          <span className="font-mono text-[13px] font-medium">{ticket.key ?? "—"}</span>
        )}
        {ticket.jiraStatus ? (
          <span className="truncate text-[11px] text-ink-faint">{ticket.jiraStatus}</span>
        ) : null}
      </div>
      <p className="text-[13px] leading-snug text-ink-soft">
        {ticket.title ?? "En attente du ticket"}
      </p>
      {ticket.run.startedAt ? (
        <p className="flex items-baseline gap-1.5 text-[11px] text-ink-faint">
          run lance depuis
          <Elapsed since={ticket.run.startedAt} />
        </p>
      ) : null}
    </header>
  );
}

function StepRow({
  id,
  label,
  detail,
  since,
  state,
  reachable,
  active,
  onSelect,
}: {
  id: string;
  label: string;
  detail: string | null;
  since: string | null;
  state: "done" | "now" | "todo";
  reachable: boolean;
  active: boolean;
  onSelect: () => void;
}) {
  const body = (
    <>
      <span className="w-5 shrink-0 text-right font-mono text-[11px] tabular-nums text-ink-faint">
        {state === "done" ? "✓" : id}
      </span>
      {state === "now" ? <Spinner /> : <span className="size-3 shrink-0" />}
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {detail ? <span className="shrink-0 font-mono text-[11px] text-ink-soft">{detail}</span> : null}
      {since ? <Elapsed since={since} className="shrink-0 text-[11px] text-ink-faint" /> : null}
    </>
  );

  const shared = cn(
    "flex w-full items-center gap-2 rounded-sm py-1 pr-1 text-left text-[13px] transition-colors",
    state === "now" ? "font-medium text-ink" : state === "done" ? "text-ink-soft" : "text-ink-faint",
    active && "bg-field text-ink",
  );

  if (!reachable) {
    return (
      <div className={shared} aria-current={state === "now" ? "step" : undefined}>
        {body}
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-current={state === "now" ? "step" : undefined}
      aria-pressed={active}
      className={cn(shared, "hover:bg-field hover:text-ink")}
      title={active ? "Afficher tout le dossier" : `Ne montrer que ce que le point ${id} a decide`}
    >
      {body}
    </button>
  );
}

/**
 * Les compteurs de boucle face a leur budget. Un compteur qui touche son budget
 * declenche une escalade au tour suivant : on doit le voir monter, pas le
 * decouvrir a l'escalade.
 */
function Loops({ loops }: { loops: readonly { name: string; count: number; budget: number | null }[] }) {
  return (
    <section className="flex flex-col gap-1.5">
      <Legend>Boucles</Legend>
      <ul className="flex flex-col gap-1">
        {loops.map((loop) => {
          const tight = loop.budget !== null && loop.count >= loop.budget - 1;
          const spent = loop.budget !== null && loop.count >= loop.budget;
          return (
            <li key={loop.name} className="flex items-baseline justify-between gap-2 text-[12px]">
              <span className="truncate text-ink-soft">{loop.name}</span>
              <span
                className={cn(
                  "shrink-0 font-mono tabular-nums",
                  spent ? "text-ko" : tight ? "text-waiting" : "text-ink-faint",
                )}
              >
                {loop.count}
                {loop.budget !== null ? ` / ${loop.budget}` : ""}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function Scope({ repos, current }: { repos: readonly RepoEntry[]; current: string | null }) {
  return (
    <section className="flex flex-col gap-1.5">
      <Legend>Perimetre</Legend>
      {repos.length === 0 ? (
        <p className="text-[12px] text-ink-faint">Pas encore etabli.</p>
      ) : (
        <ul className="flex flex-col gap-1">
          {repos.map((repo) => (
            <li key={repo.name} className="flex items-baseline gap-2 text-[12px]">
              <StateDot status={repo.status} />
              <span className={cn("min-w-0 flex-1 truncate", repo.name === current ? "text-ink" : "text-ink-soft")}>
                {repo.name}
              </span>
              {repo.level !== null ? (
                <span className="shrink-0 font-mono tabular-nums text-ink-faint">L{repo.level}</span>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Counters({ metrics }: { metrics: Metrics }) {
  return (
    <section className="mt-auto flex flex-col gap-1.5 pt-4">
      <Legend>Compteurs</Legend>
      <dl className="flex flex-col gap-1 text-[12px]">
        <Counter label="Retours sur MR" value={metrics.mrFeedbackCount} absent="renseigne a la main" />
        <Counter label="Interventions" value={metrics.humanInterventions} />
        <Counter label="Tours de boucle" value={metrics.loopTurnsTotal} />
      </dl>
    </section>
  );
}

function Counter({ label, value, absent }: { label: string; value: number | null; absent?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <dt className="truncate text-ink-soft">{label}</dt>
      <dd className={cn("shrink-0 font-mono tabular-nums", value === null ? "text-[11px] text-ink-faint" : "text-ink-soft")}>
        {value ?? absent ?? "—"}
      </dd>
    </div>
  );
}

function Legend({ children }: { children: React.ReactNode }) {
  return <h2 className="text-[11px] font-medium uppercase tracking-wide text-ink-faint">{children}</h2>;
}

function hasSection(ticket: Ticket, section: DocketSection): boolean {
  switch (section) {
    case "functional":
      return ticket.functional.length > 0;
    case "technical":
      return ticket.technical.length > 0;
    case "scope":
      return ticket.scope.some((repo) => repo.reason || repo.evidence.length > 0);
    case "checklists":
      return ticket.tests.length > 0 || ticket.code.length > 0;
    case "contradictions":
      return ticket.contradictions.length > 0;
    default:
      return false;
  }
}

/** `10.4` sur `web-app` se lit « .4 · web-app » a droite du point 10. */
function detailOf(step: string, repo: string | null): string | null {
  const sub = step.includes(".") ? `.${step.split(".")[1]}` : null;
  return [sub, repo].filter(Boolean).join(" · ") || null;
}
