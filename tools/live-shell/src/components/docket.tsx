import { At, Nothing, StateDot, statusTone } from "#/components/atoms";
import type { Arbitrage, ChecklistLine, Contradiction, DocketSection, RepoEntry, Ticket } from "#/lib/ticket";
import { cn } from "#/lib/utils";

/**
 * Le dossier.
 *
 * Ce que les agents ont decide, en texte courant : la question, la reponse, le
 * motif. Les preuves en `fichier:ligne`. Les checklists ligne par ligne. Pas de
 * cartes empilees — un dossier se lit, il ne se parcourt pas en tuiles.
 */

export interface DocketProps {
  readonly ticket: Ticket;
  readonly section: DocketSection | null;
  readonly onClearSection: () => void;
}

export function Docket({ ticket, section, onClearSection }: DocketProps) {
  const shows = (id: DocketSection) => section === null || section === id;
  const empty =
    ticket.functional.length === 0 &&
    ticket.technical.length === 0 &&
    ticket.scope.length === 0 &&
    ticket.tests.length === 0 &&
    ticket.code.length === 0 &&
    ticket.contradictions.length === 0;

  if (empty) {
    return (
      <div className="max-w-[40rem] py-8">
        <Nothing>
          Rien n'a encore ete decide. Les arbitrages, les preuves de perimetre et les checklists
          apparaissent ici au fur et a mesure que le run les produit.
        </Nothing>
      </div>
    );
  }

  return (
    // Une colonne de document, bornee a la mesure lisible : le texte, l'heure
    // et les filets s'arretent ensemble. La marge a droite est une marge, pas
    // un trou — c'est la difference entre un dossier et une page a moitie vide.
    <div className="flex max-w-[40rem] flex-col gap-10 pb-16">
      {section !== null ? (
        <p className="flex items-center gap-2 text-[12px] text-ink-faint">
          Filtre sur un seul point du run.
          <button type="button" onClick={onClearSection} className="underline hover:text-ink">
            Tout afficher
          </button>
        </p>
      ) : null}

      {shows("functional") ? (
        <Section title="Arbitrages fonctionnels" count={ticket.functional.length} step="4">
          {ticket.functional.length === 0 ? (
            <Nothing>Aucune question fonctionnelle tranchee pour l'instant.</Nothing>
          ) : (
            <Arbitrages entries={ticket.functional} />
          )}
        </Section>
      ) : null}

      {shows("technical") ? (
        <Section title="Arbitrages techniques" count={ticket.technical.length} step="7">
          {ticket.technical.length === 0 ? (
            <Nothing>Aucune question technique tranchee pour l'instant.</Nothing>
          ) : (
            <Arbitrages entries={ticket.technical} />
          )}
        </Section>
      ) : null}

      {shows("scope") ? (
        <Section title="Preuves de perimetre" count={ticket.scope.length} step="5">
          {ticket.scope.length === 0 ? (
            <Nothing>Le perimetre n'est pas encore etabli.</Nothing>
          ) : (
            <div className="flex flex-col gap-6">
              {ticket.scope.map((repo) => (
                <RepoProof key={repo.name} repo={repo} />
              ))}
            </div>
          )}
        </Section>
      ) : null}

      {shows("checklists") ? (
        <Section title="Checklists de sortie" count={ticket.tests.length + ticket.code.length} step="8">
          {ticket.tests.length === 0 && ticket.code.length === 0 ? (
            <Nothing>
              Le plan n'a pas encore rendu ses checklists. Ce sont elles que les adversaires
              rendront ligne par ligne, ensuite.
            </Nothing>
          ) : (
            <div className="flex flex-col gap-5">
              <Checklist title="Tests" lines={ticket.tests} />
              <Checklist title="Code" lines={ticket.code} />
            </div>
          )}
        </Section>
      ) : null}

      {shows("contradictions") ? (
        <Section title="Contradictions memoire" count={ticket.contradictions.length} step="11">
          {ticket.contradictions.length === 0 ? (
            <Nothing>
              Aucune note de memoire contredite. Quand un agent en signale une, elle apparait ici
              et le plan memoire la traite avant toute creation.
            </Nothing>
          ) : (
            <ul className="flex flex-col gap-5">
              {ticket.contradictions.map((entry) => (
                <ContradictionEntry key={`${entry.note}-${entry.at ?? ""}`} entry={entry} />
              ))}
            </ul>
          )}
        </Section>
      ) : null}
    </div>
  );
}

function Section({
  title,
  count,
  step,
  children,
}: {
  title: string;
  count: number;
  step: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-4">
      <header className="flex items-baseline gap-2 border-b pb-2">
        <h2 className="text-[15px] font-medium tracking-tight">{title}</h2>
        <span className="font-mono text-[12px] tabular-nums text-ink-faint">{count}</span>
        <span className="ml-auto shrink-0 font-mono text-[11px] text-ink-faint">point {step}</span>
      </header>
      {children}
    </section>
  );
}

function Arbitrages({ entries }: { entries: readonly Arbitrage[] }) {
  return (
    <ol className="flex flex-col">
      {entries.map((entry, index) => (
        <li
          key={`${entry.at ?? index}-${entry.question.slice(0, 24)}`}
          className="border-b border-line-soft py-4 first:pt-0 last:border-b-0"
        >
          <div className="grid grid-cols-[minmax(0,1fr)_2.75rem] gap-x-5">
            <h3 className="text-[14px] font-medium leading-snug text-ink">{entry.question}</h3>
            {entry.at ? <At iso={entry.at} className="text-[11px] text-ink-faint" /> : <span />}
            <p className="mt-1.5 text-[14px] leading-relaxed text-ink-soft">{entry.answer}</p>
            <span />
            {entry.why ? (
              <p className="mt-2 text-[13px] leading-relaxed text-ink-faint">{entry.why}</p>
            ) : null}
          </div>
        </li>
      ))}
    </ol>
  );
}

function RepoProof({ repo }: { repo: RepoEntry }) {
  return (
    <article className="flex flex-col gap-2">
      <div className="flex items-baseline gap-2">
        <StateDot status={repo.status} />
        <h3 className="font-mono text-[13px] font-medium">{repo.name}</h3>
        {repo.level !== null ? (
          <span className="font-mono text-[11px] tabular-nums text-ink-faint">level {repo.level}</span>
        ) : null}
        {repo.area ? <span className="truncate text-[12px] text-ink-faint">{repo.area}</span> : null}
        <span className={cn("ml-auto shrink-0 text-[12px]", statusTone(repo.status))}>{repo.status}</span>
      </div>

      {repo.reason ? (
        <p className="text-[14px] leading-relaxed text-ink-soft">{repo.reason}</p>
      ) : (
        <Nothing>Retenu sans motif ecrit — a verifier avant d'approuver le plan.</Nothing>
      )}

      {repo.evidence.length > 0 ? (
        <ul className="flex flex-col gap-1.5 pt-1">
          {repo.evidence.map((line) => (
            <li key={line} className="text-[12px] leading-relaxed">
              <Evidence line={line} />
            </li>
          ))}
        </ul>
      ) : null}
    </article>
  );
}

/**
 * `apps/web/rspack.config.mjs:41-73 — MFE_REMOTES ne contient aucun pcf`.
 * Le chemin est une mesure, donc il est en chasse fixe ; l'explication est de la
 * prose et reste lisible.
 */
function Evidence({ line }: { line: string }) {
  const split = line.indexOf(" — ");
  if (split === -1) return <code className="font-mono text-ink-soft">{line}</code>;
  return (
    <>
      <code className="font-mono text-ink">{line.slice(0, split)}</code>
      <span className="text-ink-faint"> — {line.slice(split + 3)}</span>
    </>
  );
}

function Checklist({ title, lines }: { title: string; lines: readonly ChecklistLine[] }) {
  if (lines.length === 0) return null;
  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-[12px] font-medium uppercase tracking-wide text-ink-faint">{title}</h3>
      <ul className="flex flex-col gap-1.5">
        {lines.map((line) => (
          <li key={line.id} className="flex items-baseline gap-2 text-[13px] leading-relaxed">
            <StateDot status={line.status} className="mt-1.5" />
            <span className="shrink-0 font-mono text-[11px] text-ink-faint">{line.id}</span>
            <span className="flex-1 text-ink-soft">{line.criterion}</span>
            <span className={cn("shrink-0 text-[12px]", statusTone(line.status))}>{line.status}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ContradictionEntry({ entry }: { entry: Contradiction }) {
  return (
    <li className="flex flex-col gap-1.5">
      <div className="flex items-baseline gap-2">
        <code className="font-mono text-[13px] text-ink">{entry.note}</code>
        {entry.verdict ? (
          <span className={cn("shrink-0 text-[12px]", statusTone(entry.verdict))}>{entry.verdict}</span>
        ) : null}
        {entry.raisedBy ? <span className="text-[12px] text-ink-faint">{entry.raisedBy}</span> : null}
        {entry.at ? <At iso={entry.at} className="ml-auto shrink-0 text-[11px] text-ink-faint" /> : null}
      </div>
      {entry.claim ? (
        <p className="text-[13px] leading-relaxed text-ink-soft">{entry.claim}</p>
      ) : null}
      {entry.detail ? (
        <p className="text-[13px] leading-relaxed text-ink-faint">{entry.detail}</p>
      ) : null}
    </li>
  );
}
