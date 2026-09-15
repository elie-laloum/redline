import { Elapsed, type RunMark, StateDot, StateMark } from "#/components/atoms";
import {
  DOCKET_LABELS,
  STEPS,
  type DocketSection,
  type Metrics,
  type RepoEntry,
  type Ticket,
  stepIndex,
} from "#/lib/ticket";
import type { LoopCounter } from "#/lib/use-live-run";
import { cn } from "#/lib/utils";

/**
 * Le rail.
 *
 * Il porte l'état — l'étape, sa durée, la dérive, les dépôts, les compteurs —
 * **et** il sert de sommaire au dossier : choisir une étape filtre la colonne de
 * droite sur ce qu'elle a décidé. C'est ce qui fait que mener par les décisions
 * ne coûte pas l'état.
 */

export interface RailProps {
  readonly ticket: Ticket;
  readonly loops: readonly LoopCounter[];
  /** Début de l'étape courante. Distinct du début du run. */
  readonly stepSince: string | null;
  /** Où en est le run. L'étape courante porte le même signe que le bandeau. */
  readonly mark: RunMark;
  readonly selected: DocketSection | null;
  readonly onSelect: (section: DocketSection | null) => void;
}

export function Rail({ ticket, loops, stepSince, mark, selected, onSelect }: RailProps) {
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

          return (
            <li key={step.id}>
              <StepRow
                id={step.id}
                label={step.label}
                detail={index === here ? detailOf(run.step, run.currentRepo) : null}
                since={index === here ? stepSince : null}
                state={state}
                mark={mark}
                reachable={reachable}
                active={section !== null && selected === section}
                onSelect={() => onSelect(section !== null && selected === section ? null : section)}
              />
            </li>
          );
        })}
      </ol>

      <Drift ticket={ticket} loops={loops} onSelect={onSelect} />
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
        {ticket.jiraStatus ? <span className="truncate text-[11px] text-ink-faint">{ticket.jiraStatus}</span> : null}
      </div>
      <p className="text-[13px] leading-snug text-ink-soft">{ticket.title ?? "En attente du ticket"}</p>
      {ticket.run.startedAt ? (
        <p className="flex items-baseline gap-1.5 text-[11px] text-ink-faint">
          lancé depuis
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
  mark,
  reachable,
  active,
  onSelect,
}: {
  id: string;
  label: string;
  detail: string | null;
  since: string | null;
  state: "done" | "now" | "todo";
  mark: RunMark;
  reachable: boolean;
  active: boolean;
  onSelect: () => void;
}) {
  const body = (
    <>
      {/* Le numéro reste visible une fois l'étape faite : le dossier y renvoie
          (« décidé à l'étape 4 »), et compter les lignes serait absurde. */}
      {/* Le passe est mat : « maintenant » se marque a l'encre pleine, et la
          couleur reste disponible pour le present et pour ce qui va mal. */}
      <span className="w-4 shrink-0 text-right font-mono text-[11px] tabular-nums text-ink-faint">{id}</span>
      {state === "now" ? <StateMark mark={mark} /> : <span className="size-3 shrink-0" />}
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {detail ? <span className="shrink-0 font-mono text-[11px] text-ink-soft">{detail}</span> : null}
    </>
  );

  const shared = cn(
    "flex w-full items-center gap-2 rounded-sm py-1 pr-1 text-left text-[13px] transition-colors",
    state === "now" ? "font-medium text-ink" : state === "done" ? "text-ink-soft" : "text-ink-faint",
    active && "bg-field text-ink",
  );

  const row = reachable ? (
    <button
      type="button"
      onClick={onSelect}
      aria-current={state === "now" ? "step" : undefined}
      aria-pressed={active}
      className={cn(shared, "hover:bg-field hover:text-ink")}
    >
      {body}
    </button>
  ) : (
    <div className={shared} aria-current={state === "now" ? "step" : undefined}>
      {body}
    </div>
  );

  if (state !== "now") return row;

  return (
    <div className="flex flex-col gap-0.5 pb-1">
      {row}
      {/* La durée de l'étape est le seul signal de dérive temporelle dont on
          dispose — la durée normale n'est mesurée nulle part. Elle est donc
          l'élément le plus fort du rail, pas une mention en bas de ligne. */}
      <p className="flex items-baseline gap-2 pl-6">
        <Elapsed since={since ?? ""} className="text-[19px] font-medium leading-none tracking-tight" />
        <span className="text-[11px] text-ink-faint">
          {mark === "human" ? "d'attente" : "sur cette étape"}
        </span>
      </p>
    </div>
  );
}

/**
 * La dérive, au pli.
 *
 * Quatre choses ramènent au terminal : une boucle qui approche son budget, une
 * étape anormalement longue, un agent qui part de travers, une note de mémoire
 * contredite. Les trois qui se comptent vivent ici ; la quatrième se juge sur le
 * contenu, et c'est tout le dossier qui la sert.
 *
 * Le bloc est **toujours rendu**, y compris vide : un compteur caché ne se
 * regarde pas monter, et un vide dit où en est le run.
 */
function Drift({
  ticket,
  loops,
  onSelect,
}: {
  ticket: Ticket;
  loops: readonly LoopCounter[];
  onSelect: (section: DocketSection | null) => void;
}) {
  const contradictions = ticket.contradictions.length;

  return (
    <section className="flex flex-col gap-1.5">
      <Legend>Ce qui peut déraper</Legend>

      <div className="flex flex-col gap-1 text-[12px]">
        {loops.length > 0 ? (
          loops.map((loop) => {
            const spent = loop.budget !== null && loop.count >= loop.budget;
            const tight = loop.budget !== null && loop.count >= loop.budget - 1;
            return (
              <p key={loop.name} className="flex items-baseline justify-between gap-2">
                <span className="truncate text-ink-soft">{loop.name}</span>
                <span
                  className={cn(
                    "shrink-0 font-mono tabular-nums",
                    spent ? "text-ko" : tight ? "text-drift" : "text-ink-faint",
                  )}
                >
                  {loop.count}
                  {loop.budget !== null ? ` sur ${loop.budget}` : ""}
                </span>
              </p>
            );
          })
        ) : (
          <p className="text-ink-faint">Aucune boucle : l'implémentation n'a pas commencé.</p>
        )}

        {/* Seulement ce qui signale un probleme. Le volume du dossier vit dans
            le sommaire : le mettre ici en ferait un compteur de meme nature que
            le vrai signal, et le neutraliserait. */}
        <DriftRow
          label={DOCKET_LABELS.contradictions}
          value={contradictions}
          tone={contradictions > 0 ? "text-drift" : "text-ink-faint"}
          onSelect={contradictions > 0 ? () => onSelect("contradictions") : null}
        />
      </div>
    </section>
  );
}

function DriftRow({
  label,
  value,
  tone,
  onSelect,
}: {
  label: string;
  value: number;
  tone: string;
  onSelect: (() => void) | null;
}) {
  const body = (
    <>
      <span className="min-w-0 flex-1 truncate text-left text-ink-soft">{label}</span>
      <span className={cn("shrink-0 font-mono tabular-nums", tone)}>{value}</span>
    </>
  );
  if (!onSelect) return <p className="flex items-baseline gap-2">{body}</p>;
  return (
    <button
      type="button"
      onClick={onSelect}
      className="flex items-baseline gap-2 rounded-sm text-left hover:text-ink"
    >
      {body}
    </button>
  );
}

function Scope({ repos, current }: { repos: readonly RepoEntry[]; current: string | null }) {
  return (
    <section className="flex flex-col gap-1.5">
      <Legend>Dépôts concernés</Legend>
      {repos.length === 0 ? (
        <p className="text-[12px] text-ink-faint">Pas encore établis.</p>
      ) : (
        <ul className="flex flex-col gap-1">
          {repos.map((repo) => (
            <li key={repo.name} className="flex items-baseline gap-2 text-[12px]">
              <StateDot status={repo.status} />
              <span className={cn("min-w-0 flex-1 truncate", repo.name === current ? "text-ink" : "text-ink-soft")}>
                {repo.name}
              </span>
              {repo.level !== null ? (
                <span className="shrink-0 text-ink-faint">niveau {repo.level}</span>
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
      <Legend>Compteurs du run</Legend>
      <dl className="flex flex-col gap-1 text-[12px]">
        <Counter label="Retours reçus sur la MR" value={metrics.mrFeedbackCount} absent="pas encore mesuré" />
        <Counter label="Fois où tu es intervenu" value={metrics.humanInterventions} />
        <Counter label="Tours de boucle" value={metrics.loopTurnsTotal} />
      </dl>
    </section>
  );
}

function Counter({ label, value, absent }: { label: string; value: number | null; absent?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <dt className="truncate text-ink-soft">{label}</dt>
      <dd
        className={cn(
          "shrink-0 tabular-nums",
          value === null ? "text-[11px] text-ink-faint" : "font-mono text-ink-soft",
        )}
      >
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

/** `10.4` sur `web-app` se lit « .4 · web-app » à droite de l'étape 10. */
function detailOf(step: string, repo: string | null): string | null {
  const sub = step.includes(".") ? `.${step.split(".")[1]}` : null;
  return [sub, repo].filter(Boolean).join(" · ") || null;
}
