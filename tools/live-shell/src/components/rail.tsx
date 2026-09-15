import { useEffect, useState } from "react";
import { AgentDot, Caret, Elapsed, type RunMark, StateDot, StateMark } from "#/components/atoms";
import {
  DOCKET_LABELS,
  STEPS,
  type DocketSection,
  type Metrics,
  type RepoEntry,
  type Ticket,
  stepIndex,
} from "#/lib/ticket";
import type { LoopCounter, StepAgent } from "#/lib/use-live-run";
import { cn } from "#/lib/utils";

/**
 * Le rail.
 *
 * Il sert de sommaire au dossier — choisir une étape filtre la colonne de
 * droite sur ce qu'elle a décidé — et il montre qui travaille, là, maintenant.
 *
 * Les étapes n'ont plus de numéro. Un `<ol>` en porte déjà un pour qui écoute
 * la page, et treize libellés qui se lisent seuls valent mieux que treize
 * libellés précédés d'un compteur qu'il faut traduire.
 */

export interface RailProps {
  readonly ticket: Ticket;
  readonly loops: readonly LoopCounter[];
  /** Où en est le run. L'étape courante porte le même signe que le bandeau. */
  readonly mark: RunMark;
  /** Les agents de chaque étape, dans l'ordre où ils ont pris la main. */
  readonly agents: ReadonlyMap<string, readonly StepAgent[]>;
  readonly selected: DocketSection | null;
  readonly onSelect: (section: DocketSection | null) => void;
}

export function Rail({ ticket, loops, mark, agents, selected, onSelect }: RailProps) {
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
                state={state}
                mark={mark}
                agents={agents.get(step.id) ?? []}
                reachable={reachable}
                active={section !== null && selected === section}
                onSelect={() => onSelect(section !== null && selected === section ? null : section)}
              />
            </li>
          );
        })}
      </ol>

      {/* Empilés en bas. Chacun disparaît quand il n'a rien à dire : un bloc
          vide entretenu en permanence apprend à ne plus lire la colonne. */}
      <div className="mt-auto flex flex-col pt-6">
        <Scope repos={ticket.scope} current={run.currentRepo} />
        <Watch ticket={ticket} loops={loops} onSelect={onSelect} />
        <Counters metrics={ticket.metrics} />
      </div>
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
      {/* La durée du run entier. Le bandeau porte celle de l'étape : ce sont
          deux questions différentes, et aucune ne remplace l'autre. */}
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
  state,
  mark,
  agents,
  reachable,
  active,
  onSelect,
}: {
  id: string;
  label: string;
  detail: string | null;
  state: "done" | "now" | "todo";
  mark: RunMark;
  agents: readonly StepAgent[];
  reachable: boolean;
  active: boolean;
  onSelect: () => void;
}) {
  // L'étape courante est dépliée ; une étape passée s'ouvre à la demande.
  const [open, setOpen] = useState(false);
  const foldable = state !== "now" && agents.length > 0;
  const expanded = state === "now" ? agents.length > 0 : open;

  // Une pulsation sous l'étape dit déjà que ça vit. Ajouter le loader au-dessus
  // ferait deux mouvements à vingt pixels l'un de l'autre pour une seule chose,
  // et le bandeau porte le loader du run en permanence.
  const alive = agents.some((agent) => agent.speaking);

  const body = (
    <>
      {state === "now" && !alive ? (
        <StateMark mark={mark} />
      ) : (
        <span aria-hidden className="flex size-3 shrink-0 items-center justify-center">
          {state === "now" ? <span className="size-2 rounded-full bg-ink" /> : null}
        </span>
      )}
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

  if (agents.length === 0) return row;

  return (
    <div className="flex flex-col">
      <div className="flex items-center">
        {row}
        {foldable ? (
          <button
            type="button"
            onClick={() => setOpen((value) => !value)}
            aria-expanded={open}
            aria-controls={`agents-${id}`}
            className="flex shrink-0 items-center gap-1 rounded-sm py-1 pl-1 text-[11px] text-ink-faint hover:text-ink"
          >
            {agents.length > 1 ? <span className="font-mono tabular-nums">{agents.length}</span> : null}
            <Caret open={open} />
            <span className="sr-only">agents de l'étape {label}</span>
          </button>
        ) : null}
      </div>

      {expanded ? (
        <ul id={`agents-${id}`} className="flex flex-col pb-2 pl-5">
          {agents.map((agent) => (
            <li key={agent.name} className="flex items-center gap-2 py-0.5 text-[12px]">
              <AgentDot state={agent.state} speaking={agent.speaking} />
              <span
                className={cn("min-w-0 flex-1 truncate", agent.state === "done" ? "text-ink-faint" : "text-ink-soft")}
              >
                {agent.name}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

/**
 * Ce qu'il faut surveiller.
 *
 * Deux choses ramènent au terminal et se comptent : une boucle qui approche son
 * budget, une note de mémoire contredite. Les deux autres dérives — une étape
 * anormalement longue, un agent qui part de travers — se lisent ailleurs, dans
 * la durée du bandeau et dans le dossier.
 */
function Watch({
  ticket,
  loops,
  onSelect,
}: {
  ticket: Ticket;
  loops: readonly LoopCounter[];
  onSelect: (section: DocketSection | null) => void;
}) {
  const contradictions = ticket.contradictions.length;
  if (loops.length === 0 && contradictions === 0) return null;

  const tight = loops.filter((loop) => loop.budget !== null && loop.count >= loop.budget - 1).length;
  const alerts = tight + (contradictions > 0 ? 1 : 0);

  return (
    <Fold title="À surveiller" signal={alerts > 0 ? alerts : null} id="watch">
      {loops.map((loop) => {
        const spent = loop.budget !== null && loop.count >= loop.budget;
        const close = loop.budget !== null && loop.count >= loop.budget - 1;
        return (
          <p key={loop.name} className="flex items-baseline justify-between gap-2">
            <span className="truncate text-ink-soft">{loop.name}</span>
            <span
              className={cn(
                "shrink-0 font-mono tabular-nums",
                spent ? "text-ko" : close ? "text-drift" : "text-ink-faint",
              )}
            >
              {loop.count}
              {loop.budget !== null ? ` sur ${loop.budget}` : ""}
            </span>
          </p>
        );
      })}

      {contradictions > 0 ? (
        <button
          type="button"
          onClick={() => onSelect("contradictions")}
          className="flex items-baseline gap-2 rounded-sm text-left hover:text-ink"
        >
          <span className="min-w-0 flex-1 truncate text-ink-soft">{DOCKET_LABELS.contradictions}</span>
          <span className="shrink-0 font-mono tabular-nums text-drift">{contradictions}</span>
        </button>
      ) : null}
    </Fold>
  );
}

function Scope({ repos, current }: { repos: readonly RepoEntry[]; current: string | null }) {
  if (repos.length === 0) return null;

  return (
    <Fold title="Dépôts concernés" signal={null} id="scope">
      {repos.map((repo) => (
        <p key={repo.name} className="flex items-baseline gap-2">
          <StateDot status={repo.status} />
          <span className={cn("min-w-0 flex-1 truncate", repo.name === current ? "text-ink" : "text-ink-soft")}>
            {repo.name}
          </span>
          {repo.level !== null ? <span className="shrink-0 text-ink-faint">niveau {repo.level}</span> : null}
        </p>
      ))}
    </Fold>
  );
}

function Counters({ metrics }: { metrics: Metrics }) {
  const rows = [
    { label: "Fois où tu es intervenu", value: metrics.humanInterventions },
    { label: "Tours de boucle", value: metrics.loopTurnsTotal },
  ].filter((row): row is { label: string; value: number } => row.value !== null);

  if (rows.length === 0) return null;

  return (
    <Fold title="Compteurs du run" signal={null} id="counters">
      {rows.map((row) => (
        <p key={row.label} className="flex items-baseline justify-between gap-2">
          <span className="truncate text-ink-soft">{row.label}</span>
          <span className="shrink-0 font-mono tabular-nums text-ink-soft">{row.value}</span>
        </p>
      ))}
    </Fold>
  );
}

/**
 * Un bloc repliable du bas du rail.
 *
 * Replier ne doit jamais cacher un problème : quand le bloc est fermé et qu'il
 * porte un signal, son en-tête le montre. C'est ce qui rend le repli sans
 * risque, et donc utilisable.
 *
 * L'état se retient d'un rechargement à l'autre — le shell est rejoué souvent,
 * replier trois blocs par heure serait une corvée. `localStorage` peut jeter
 * (navigation privée, données de site bloquées) : le bloc reste alors ouvert,
 * ce qui est le bon défaut.
 */
function Fold({
  title,
  signal,
  id,
  children,
}: {
  title: string;
  signal: number | null;
  id: string;
  children: React.ReactNode;
}) {
  const key = `rail.fold.${id}`;
  const [open, setOpen] = useState(true);

  // Après le montage seulement : le rendu serveur n'a pas de `localStorage`, et
  // rendre fermé côté client ce que le serveur a rendu ouvert casserait
  // l'hydratation.
  useEffect(() => {
    try {
      if (localStorage.getItem(key) === "closed") setOpen(false);
    } catch {
      /* le bloc reste ouvert */
    }
  }, [key]);

  function toggle() {
    setOpen((value) => {
      try {
        localStorage.setItem(key, value ? "closed" : "open");
      } catch {
        /* sans mémoire, mais pliable quand même */
      }
      return !value;
    });
  }

  return (
    <section className="border-t border-line-soft py-2.5 first:border-t-0 first:pt-0">
      <h2>
        <button
          type="button"
          onClick={toggle}
          aria-expanded={open}
          aria-controls={`fold-${id}`}
          className="flex w-full items-center gap-1.5 rounded-sm text-left text-[11px] font-medium uppercase tracking-wide text-ink-faint hover:text-ink-soft"
        >
          <Caret open={open} />
          <span className="min-w-0 flex-1 truncate">{title}</span>
          {!open && signal !== null ? (
            <span className="shrink-0 font-mono tabular-nums text-drift">{signal}</span>
          ) : null}
        </button>
      </h2>

      {open ? (
        <div id={`fold-${id}`} className="flex flex-col gap-1 pt-1.5 pl-[1.125rem] text-[12px]">
          {children}
        </div>
      ) : null}
    </section>
  );
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

/** `10.4` sur `web-app` se lit « .4 · web-app » à droite de l'étape. */
function detailOf(step: string, repo: string | null): string | null {
  const sub = step.includes(".") ? `.${step.split(".")[1]}` : null;
  return [sub, repo].filter(Boolean).join(" · ") || null;
}
