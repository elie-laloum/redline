import { useState } from "react";
import { Caret, Elapsed, type Progress, ProgressDot } from "#/components/atoms";
import { STEPS, stepIndex, stepToken, type Ticket } from "#/lib/ticket";
import type { StepAgent } from "#/lib/use-live-run";
import { cn } from "#/lib/utils";

/**
 * Le rail.
 *
 * Il montre une seule chose : où en est le run, et qui travaille là, maintenant.
 * Rien ne s'y clique — ce qui se lit se lit dans l'établi, à droite.
 *
 * Les étapes n'ont plus de numéro. Un `<ol>` en porte déjà un pour qui écoute
 * la page, et treize libellés qui se lisent seuls valent mieux que treize
 * libellés précédés d'un compteur qu'il faut traduire.
 */

export interface RailProps {
  readonly ticket: Ticket;
  /** L'etape recoupee sur le flux, la meme que le bandeau. */
  readonly step: string;
  /**
   * L'état de chacune des treize étapes, dans l'ordre du rail.
   *
   * Calculé une fois dans `deriveSteps`, pas ici : le rail dessine, il ne
   * décide pas. C'est ce qui garantit que la pastille de l'étape courante et
   * celle du bandeau ne peuvent pas se contredire.
   */
  readonly steps: readonly Progress[];
  /** Les agents de chaque étape, dans l'ordre où ils ont pris la main. */
  readonly agents: ReadonlyMap<string, readonly StepAgent[]>;
}

export function Rail({ ticket, step: cursor, steps, agents }: RailProps) {
  const { run } = ticket;
  const here = stepIndex(cursor);

  return (
    <nav aria-label="Avancement du run" className="flex h-full flex-col gap-6 overflow-y-auto px-4 py-5">
      <Identity ticket={ticket} />

      <ol className="flex flex-col">
        {STEPS.map((step, index) => (
          <li key={step.id}>
            <StepRow
              id={step.id}
              label={step.label}
              detail={index === here ? detailOf(cursor, run.currentRepo) : null}
              state={steps[index] ?? "todo"}
              here={index === here}
              agents={agents.get(step.id) ?? []}
            />
          </li>
        ))}
      </ol>
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

/**
 * Une étape, et les agents qu'elle a ouverts sous elle.
 *
 * Les deux niveaux portent **la même pastille**, et c'est tout le modèle : le
 * loader descend d'un cran quand l'étape passe la main à un sous-agent, et
 * remonte quand celui-ci a rendu. On lit donc en un coup d'œil à quelle
 * profondeur le run travaille, sans avoir à savoir ce qu'est un sous-agent.
 *
 * Il n'y a jamais deux loaders : le workflow n'a pas de parallélisme, et la
 * dérivation le garantit plutôt que de l'espérer.
 */
function StepRow({
  id,
  label,
  detail,
  state,
  here,
  agents,
}: {
  id: string;
  label: string;
  detail: string | null;
  state: Progress;
  /** L'étape où le run se trouve. Distincte de l'état : une étape courante
      peut être `idle` — elle attend son sous-agent — sans cesser d'être là où
      on en est. */
  here: boolean;
  agents: readonly StepAgent[];
}) {
  // L'étape courante est dépliée ; une étape passée s'ouvre à la demande.
  const [open, setOpen] = useState(false);
  const foldable = !here && agents.length > 0;
  const expanded = here ? agents.length > 0 : open;

  // L'étape a passé la main : sa pastille respire au lieu de rester éteinte.
  // Un gris fixe se lit « rien ne se passe ici » — c'est vrai de la ligne, et
  // faux du run, qui travaille une ligne plus bas. Une ou deux : l'agent qui
  // tourne peut être un enfant de l'`orchestrator`, et l'étape l'a ouvert aussi
  // sûrement que si elle l'avait invoqué elle-même.
  const handed = state === "idle" && working(agents);

  const body = (
    <>
      <ProgressDot state={state} label={label} pulse={handed} />
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {detail ? <span className="shrink-0 font-mono text-[11px] text-ink-soft">{detail}</span> : null}
    </>
  );

  // La ligne ne clique plus. Tout ce qu'une etape a produit est visible en
  // permanence dans l'etabli, donc il n'y a plus de filtre a poser : le rail est
  // redevenu ce qu'il n'aurait jamais du cesser d'etre, un sommaire qui se lit.
  const row = (
    <div
      className={cn(
        "flex w-full items-center gap-2 rounded-sm py-1 pr-1 text-left text-[13px]",
        here ? "font-medium text-ink" : state === "done" ? "text-ink-soft" : "text-ink-faint",
      )}
      aria-current={here ? "step" : undefined}
    >
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
            <AgentRow key={agent.name} agent={agent} />
          ))}
        </ul>
      ) : null}
    </div>
  );
}

/** Est-ce que quelque chose tourne, quelque part sous cette étape. */
function working(agents: readonly StepAgent[]): boolean {
  return agents.some((agent) => agent.state === "running" || working(agent.children));
}

/**
 * Un agent, et ceux qu'il a ouverts.
 *
 * Le seul cas réel est le cycle d'implémentation : l'`orchestrator` route, et
 * les six agents du cycle vivent d'un cran plus à droite. La profondeur est
 * portée par le retrait seul — pas de filet, pas de puce : le rail est déjà
 * une liste, et un second signe de liste par niveau finirait par peser plus
 * que ce qu'il organise.
 */
function AgentRow({ agent }: { agent: StepAgent }) {
  return (
    <li className="flex flex-col">
      <div className="flex items-center gap-2 py-0.5 text-[12px]">
        <ProgressDot state={agent.state} label={agent.name} />
        <span
          className={cn("min-w-0 flex-1 truncate", agent.state === "running" ? "text-ink" : "text-ink-soft")}
        >
          {/* Ce qui suit est un nom d'agent, pas une sous-étape. Sans ce mot,
              `red-checker` sous « Implémentation » se lit comme un point du
              workflow — et le rail a treize points qui, eux, n'ont pas de nom
              en anglais avec un tiret. */}
          <span className="text-ink-faint">agent - </span>
          {agent.name}
        </span>
      </div>

      {agent.children.length > 0 ? (
        <ul className="flex flex-col pl-5">
          {agent.children.map((child) => (
            <AgentRow key={child.name} agent={child} />
          ))}
        </ul>
      ) : null}
    </li>
  );
}

/** `10.4` sur `web-app` se lit « .4 · web-app » à droite de l'étape. */
function detailOf(step: string, repo: string | null): string | null {
  const sub = stepToken(step)?.sub;
  return [sub ? `.${sub}` : null, repo].filter(Boolean).join(" · ") || null;
}
