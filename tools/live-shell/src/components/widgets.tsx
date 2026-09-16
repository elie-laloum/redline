import { useEffect, useState } from "react";
import { At, Nothing, StateDot, statusTone } from "#/components/atoms";
import { CAROUSEL_FROM, Carousel, type Cell, Grid } from "#/components/reader";
import type { Arbitrage, ChecklistLine, Contradiction, DocketSection, RepoEntry, Ticket } from "#/lib/ticket";
import { DOCKET_LABELS } from "#/lib/ticket";
import { cn } from "#/lib/utils";

/**
 * Ce que le run a decide, dans l'etabli.
 *
 * **Rien n'y est borne a une mesure de lecture.** La prose du dossier l'etait,
 * quand elle vivait dans une colonne de document : soixante-huit caracteres, et
 * la moitie droite de l'ecran en marge. Un widget n'est pas un document — il est
 * large comme le bandeau au-dessus de lui, et une reponse de quatre-vingts
 * caracteres tient alors sur une ligne au lieu de deux. Couper plus tot ne
 * rendait pas la lecture plus facile, ca rendait la page plus longue.
 *
 * Ces quatre-la etaient une colonne de document qu'on atteignait en filtrant la
 * page depuis le rail : le contenu quittait l'ecran, le chantier avec lui, et on
 * revenait en arriere pour retrouver ou en etait le run. Ils sont maintenant des
 * widgets, sous le chantier, dans le meme flux que lui — et le rail n'est plus
 * qu'un raccourci qui fait defiler jusqu'a l'un d'eux et l'ouvre a la bonne
 * entree.
 *
 * Aucun ne s'affiche sans matiere. Un cadre vide entretenu en permanence
 * apprend a ne plus lire la colonne ; une absence, elle, se dit en une phrase.
 */

/**
 * Ce qu'un widget porte comme cible.
 *
 * Les cinq sections du dossier viennent du rail ; `review` n'y est pas, parce
 * que la revue n'est pas une decision du run — c'est la meme matiere que les
 * checklists, vue pendant qu'elle bouge. Elle a donc une cible, mais pas
 * d'entree dans le rail.
 */
export type FocusSection = DocketSection | "review";

export interface Focus {
  readonly section: FocusSection;
  readonly index: number;
}

export interface WidgetProps {
  readonly ticket: Ticket;
  readonly focus: Focus | null;
  readonly onFocus: (focus: Focus) => void;
}

/** L'ancre vers laquelle le rail fait defiler. */
export function anchorOf(section: FocusSection): string {
  return `widget-${section}`;
}

function at(focus: Focus | null, section: FocusSection, count: number): number {
  if (focus?.section !== section) return 0;
  return Math.max(0, Math.min(count - 1, focus.index));
}

// --------------------------------------------------------------- arbitrages ----

/**
 * Un arbitrage, un ecran.
 *
 * Il n'a pas d'etat a montrer d'un coup d'oeil — c'est une question, une
 * reponse, et la raison qui les relie. Le carrousel est donc la vue d'ensemble
 * et pas un detail : on ne « survole » pas six decisions, on en lit une.
 *
 * Le **pourquoi** est la seule chose qui vaille encore quelque chose six
 * semaines plus tard, quand la reponse est devenue du code et que personne ne
 * sait plus ce qu'on avait ecarte. Il est donc rendu entier, jamais coupe.
 */
export function Decisions({
  section,
  title,
  entries,
  focus,
  onFocus,
}: {
  section: FocusSection;
  title: string;
  entries: readonly Arbitrage[];
  focus: Focus | null;
  onFocus: (focus: Focus) => void;
}) {
  if (entries.length === 0) return null;
  const here = at(focus, section, entries.length);
  const entry = entries[here];
  if (!entry) return null;

  const body = <Decision entry={entry} />;

  return (
    <Widget id={anchorOf(section)} title={title} count={entries.length}>
      {entries.length < CAROUSEL_FROM ? (
        body
      ) : (
        <Carousel
          label="Arbitrage"
          count={entries.length}
          at={here}
          onGo={(index) => onFocus({ section, index })}
        >
          {body}
        </Carousel>
      )}
    </Widget>
  );
}

function Decision({ entry }: { entry: Arbitrage }) {
  return (
    <article className="flex flex-col gap-2">
      <div className="flex items-baseline gap-3">
        <p className="min-w-0 flex-1 text-[15px] font-medium leading-snug">{entry.question}</p>
        {entry.at ? <At iso={entry.at} className="shrink-0 text-[11px] text-ink-faint" /> : null}
      </div>
      <p className="text-[14px] leading-relaxed text-ink-soft">{entry.answer}</p>
      {entry.why ? (
        <p className="text-[13px] leading-relaxed text-ink-faint">{entry.why}</p>
      ) : (
        <Nothing>Retenu sans raison écrite — à vérifier avant d'approuver le plan.</Nothing>
      )}
    </article>
  );
}

// -------------------------------------------------------------------- depots ----

/**
 * Le perimetre, et pourquoi.
 *
 * Le nom, le niveau et l'etat vivent deja dans le rail, ou ils se lisent sans
 * geste. Ce que ce widget ajoute est la seule chose qui manquait : la preuve.
 * Chaque depot a ete retenu pour une raison et des `fichier:ligne` — c'est ce
 * qu'on vient verifier avant d'approuver un plan, et c'est ce qui se perd
 * d'abord quand personne ne le montre.
 */
export function Repos({ ticket, focus, onFocus }: WidgetProps) {
  const repos = ticket.scope.filter((repo) => repo.reason || repo.evidence.length > 0);
  if (repos.length === 0) return null;

  const here = at(focus, "scope", repos.length);
  const repo = repos[here];
  if (!repo) return null;

  return (
    <Widget id={anchorOf("scope")} title="Dépôts concernés" count={repos.length}>
      {repos.length < CAROUSEL_FROM ? (
        <Repo repo={repo} />
      ) : (
        <Carousel
          label="Dépôt"
          count={repos.length}
          at={here}
          onGo={(index) => onFocus({ section: "scope", index })}
        >
          <Repo repo={repo} />
        </Carousel>
      )}
    </Widget>
  );
}

function Repo({ repo }: { repo: RepoEntry }) {
  return (
    <article className="flex flex-col gap-2">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="flex items-baseline gap-2">
          <StateDot status={repo.status} />
          <span className="font-mono text-[14px] font-medium">{repo.name}</span>
        </span>
        {repo.level !== null ? <span className="text-[12px] text-ink-faint">niveau {repo.level}</span> : null}
        <span className={cn("text-[12px]", statusTone(repo.status))}>{repo.status}</span>
      </div>

      {repo.reason ? (
        <p className="text-[14px] leading-relaxed text-ink-soft">{repo.reason}</p>
      ) : (
        <Nothing>Retenu sans raison écrite.</Nothing>
      )}

      {repo.evidence.length > 0 ? (
        <ul className="flex flex-col border-t border-line-soft pt-2">
          {repo.evidence.map((line) => (
            <Evidence key={line} line={line} />
          ))}
        </ul>
      ) : (
        <Nothing>Aucune preuve localisée — le scope-scout n'a rien cité.</Nothing>
      )}
    </article>
  );
}

/**
 * Une preuve : `fichier:ligne — ce qu'on y voit`.
 *
 * Coupee au tiret cadratin. La moitie gauche est un emplacement, donc du
 * monospace en encre pleine ; la moitie droite est de la prose, donc de la prose.
 */
function Evidence({ line }: { line: string }) {
  const cut = line.indexOf("—");
  const where = cut > 0 ? line.slice(0, cut).trim() : line.trim();
  const what = cut > 0 ? line.slice(cut + 1).trim() : null;

  return (
    <li className="flex flex-wrap items-baseline gap-x-2 border-b border-line-soft py-1 text-[12px] last:border-b-0">
      <code className="font-mono text-ink">{where}</code>
      {what ? <span className="min-w-0 flex-1 text-ink-faint">{what}</span> : null}
    </li>
  );
}

// -------------------------------------------------------------------- revue ----

const PASSED = ["passed", "done", "ok", "success"];
const FAILED = ["failed", "ko"];
const RUNNING = ["in_progress", "running", "doing", "wip"];

function cellsOf(lines: readonly ChecklistLine[]): Cell[] {
  return lines.map((line) => ({
    id: line.id,
    tone: PASSED.includes(line.status)
      ? "done"
      : FAILED.includes(line.status)
        ? "failed"
        : RUNNING.includes(line.status)
          ? "running"
          : "todo",
  }));
}

/**
 * Ce qu'on attend des carres a cette sous-etape.
 *
 * Sans cette phrase, la revue ment une fois sur deux. Au point 10.3 le
 * `red-checker` verifie que **tous les tests echouent**, et un mur rouge y est
 * le bon resultat — c'est meme la seule preuve qu'ils testent quelque chose.
 * Deux etapes plus loin le meme mur rouge veut dire que le code est casse. Le
 * carre montre le resultat, pas un verdict : c'est l'en-tete qui dit comment le
 * lire, et sans lui personne ne peut le savoir.
 */
const EXPECTED: Record<string, string> = {
  "10.1": "Les tests s'écrivent. Rien n'est encore passé.",
  "10.2": "Les tests sont relus ligne à ligne avant d'être lancés.",
  "10.3": "Tous les tests doivent être rouges — un vert ici veut dire qu'il ne teste rien.",
  "10.4": "Le code s'écrit. Les carrés de code verdissent à mesure.",
  "10.5": "Les tests doivent tous passer au vert.",
  "10.6": "Le code est relu ligne à ligne. Tout doit rester vert.",
  "10.7": "Publication amont.",
};

/**
 * La revue : le contrat de sortie, et ou il en est.
 *
 * C'etait deux widgets — une checklist figee et une revue qui ne montrait que
 * ce qui restait — pour une seule matiere. La checklist s'approuve maintenant
 * **dans le plan**, ou elle est a sa place : on ne valide pas un plan sans son
 * contrat de sortie. Ici il ne reste que la vue vivante, et elle montre
 * **toutes** les lignes : une revue qui retire ce qui est passe ne peut jamais
 * finir en tout vert, alors que le tout-vert est precisement ce qu'on attend.
 *
 * Elle est toujours le deuxieme bloc, juste sous le plan : pendant les trois
 * heures du cycle, c'est la chose qu'on surveille, et la chercher plus bas a
 * chaque ouverture serait une corvee. Toujours a la meme place — pas collee :
 * un bloc qui suit le defilement mange le haut de l'ecran pendant qu'on lit
 * autre chose.
 *
 * **Elle n'existe pas avant que le plan soit approuve.** Les checklists sont
 * ecrites au point 8, donc elle avait de la matiere des ce moment-la et
 * s'affichait pendant le gate : cinquante carres vides a cote d'un plan qu'on
 * etait en train de lire, pour un contrat qu'on n'avait pas encore accepte. Le
 * contrat se lit dans le plan tant qu'il se discute ; ici il se suit une fois
 * qu'il engage.
 */
export function Review({ ticket, step, focus, onFocus }: WidgetProps & { step: string }) {
  const lines = [...ticket.tests, ...ticket.code];
  if (lines.length === 0 || ticket.planApprovedAt === null) return null;

  const here = at(focus, "review", lines.length);
  const passed = lines.filter((line) => PASSED.includes(line.status)).length;
  const settled = passed === lines.length;
  const expected = EXPECTED[step] ?? null;

  return (
    <section id={anchorOf("review")} className="scroll-mt-[calc(var(--banner-h)+1rem)] border-b px-6 py-4">
      <header className="flex flex-wrap items-baseline gap-x-2 gap-y-1 pb-3">
        <h2 className="text-[15px] font-medium tracking-tight">La revue</h2>
        <span className={cn("font-mono text-[12px] tabular-nums", settled ? "text-ok" : "text-ink-faint")}>
          {passed}/{lines.length}
        </span>
        {expected ? <span className="text-[12px] text-ink-faint">{expected}</span> : null}
      </header>

      <div className="flex flex-col gap-4">
        <Boards
          tests={ticket.tests}
          code={ticket.code}
          at={here}
          onPick={(index) => onFocus({ section: "review", index })}
          tally={(board) => {
            const green = board.filter((line) => PASSED.includes(line.status)).length;
            return (
              <span
                className={cn("font-mono tabular-nums", green === board.length ? "text-ok" : "text-ink-soft")}
              >
                {green}/{board.length}
              </span>
            );
          }}
        />
      </div>
    </section>
  );
}

/**
 * Deux tableaux cote a cote, chacun avec le sien.
 *
 * Ils partageaient un seul carrousel dont l'index courait bout a bout : cliquer
 * le premier carre du code ouvrait « 24 sur 50 », un numero qui n'existe dans
 * aucune des deux listes. Les tests et le code sont deux contrats separes.
 */
function Boards({
  tests,
  code,
  at: here,
  onPick,
  tally,
}: {
  tests: readonly ChecklistLine[];
  code: readonly ChecklistLine[];
  /** L'index court bout a bout sur les deux listes : c'est ce que le rail ouvre. */
  at: number;
  onPick: (index: number) => void;
  tally: (lines: readonly ChecklistLine[]) => React.ReactNode;
}) {
  return (
    <div className="grid grid-cols-1 gap-x-10 gap-y-6 md:grid-cols-2">
      <Board label="Tests" lines={tests} at={here} onPick={onPick} tally={tally} />
      <Board
        label="Code"
        lines={code}
        at={here - tests.length}
        onPick={(index) => onPick(index + tests.length)}
        tally={tally}
      />
    </div>
  );
}

/**
 * Un tableau et son lecteur, autonome.
 *
 * Sa position est a lui : ouvrir une ligne de code ne doit pas renvoyer les
 * tests a leur premiere ligne. Le `at` qui vient d'en haut ne sert qu'a une
 * chose — quand le rail ouvre la section sur une entree precise, le tableau qui
 * la contient l'adopte, et l'autre ne bouge pas.
 */
function Board({
  label,
  lines,
  at: here,
  onPick,
  tally,
}: {
  label: string;
  lines: readonly ChecklistLine[];
  at: number;
  onPick: (index: number) => void;
  tally: (lines: readonly ChecklistLine[]) => React.ReactNode;
}) {
  const [local, setLocal] = useState(0);
  const targeted = here >= 0 && here < lines.length;

  // On n'adopte la cible que quand elle entre dans ce tableau-ci.
  useEffect(() => {
    if (targeted) setLocal(here);
  }, [here, targeted]);

  if (lines.length === 0) return null;

  const cells = cellsOf(lines);
  const open = Math.min(local, lines.length - 1);
  const line = lines[open];

  const go = (index: number) => {
    setLocal(index);
    onPick(index);
  };

  return (
    <div className="flex min-w-0 flex-col gap-2">
      <h3 className="flex items-baseline gap-2 text-[11px] font-medium uppercase tracking-wide text-ink-faint">
        {label}
        {tally(lines)}
      </h3>
      <Grid label={label} cells={cells} at={open} onPick={go} />

      {line ? (
        <div className="border-t border-line-soft pt-3">
          <Carousel
            label={`Ligne ${label.toLowerCase()}`}
            count={lines.length}
            at={open}
            onGo={go}
            tone={(index) => {
              const cell = cells[index];
              return cell?.tone === "done" ? "bg-ok" : cell?.tone === "failed" ? "bg-ko" : "bg-line";
            }}
          >
            <Line line={line} />
          </Carousel>
        </div>
      ) : null}
    </div>
  );
}

function Line({ line }: { line: ChecklistLine }) {
  return (
    <article className="flex flex-col gap-1">
      <div className="flex items-baseline gap-2">
        <span className="font-mono text-[11px] text-ink-faint">{line.id}</span>
        <span className={cn("text-[12px]", statusTone(line.status))}>{line.status}</span>
      </div>
      <p className="text-[14px] leading-relaxed text-ink-soft">{line.criterion}</p>
    </article>
  );
}

// ----------------------------------------------------------- contradictions ----

/**
 * Ce que le run a trouve faux dans la memoire.
 *
 * C'est la seule matiere du dossier qui ne decrit pas le ticket mais ce qu'on
 * croyait savoir avant lui. Elle porte donc l'ambre de derive partout — dans le
 * rail, dans la bande mobile, et ici — parce qu'elle demande de regarder, pas de
 * repondre : une note contredite qui n'est pas corrigee redonnera la meme
 * mauvaise reponse au prochain run.
 */
export function Contradictions({ ticket, focus, onFocus }: WidgetProps) {
  const entries = ticket.contradictions;
  if (entries.length === 0) return null;

  const here = at(focus, "contradictions", entries.length);
  const entry = entries[here];
  if (!entry) return null;

  return (
    <Widget
      id={anchorOf("contradictions")}
      title={DOCKET_LABELS.contradictions}
      count={entries.length}
      aside="à corriger dans la mémoire"
      tone="text-drift"
    >
      {entries.length < CAROUSEL_FROM ? (
        <Contradicted entry={entry} />
      ) : (
        <Carousel
          label="Note contredite"
          count={entries.length}
          at={here}
          onGo={(index) => onFocus({ section: "contradictions", index })}
          tone={() => "bg-drift/40"}
        >
          <Contradicted entry={entry} />
        </Carousel>
      )}
    </Widget>
  );
}

function Contradicted({ entry }: { entry: Contradiction }) {
  return (
    <article className="flex flex-col gap-2">
      <div className="flex items-baseline gap-3">
        <p className="min-w-0 flex-1 text-[15px] font-medium leading-snug text-drift">{entry.note}</p>
        {entry.at ? <At iso={entry.at} className="shrink-0 text-[11px] text-ink-faint" /> : null}
      </div>
      {entry.claim ? <p className="text-[14px] leading-relaxed text-ink-soft">{entry.claim}</p> : null}
      {entry.verdict ? <p className="text-[14px] leading-relaxed text-ink-soft">{entry.verdict}</p> : null}
      {entry.detail ? <p className="text-[13px] leading-relaxed text-ink-faint">{entry.detail}</p> : null}
      {entry.raisedBy ? (
        <p className="text-[12px] text-ink-faint">
          <span className="text-ink-faint/70">agent - </span>
          {entry.raisedBy}
        </p>
      ) : null}
    </article>
  );
}

// ------------------------------------------------------------------ enveloppe ----

/**
 * L'enveloppe d'un widget.
 *
 * La meme que celle du chantier : un titre sur un filet, un compte en
 * monospace, et rien d'autre. Pas de carte, pas de fond, pas de rayon — ce qui
 * separe deux widgets est le filet du suivant.
 */
function Widget({
  id,
  title,
  count,
  aside,
  tone,
  children,
}: {
  id: string;
  title: string;
  count: number;
  aside?: string | null;
  tone?: string | null;
  children: React.ReactNode;
}) {
  return (
    // `scroll-mt` : le bandeau est collant, donc une ancre qui vise le haut de
    // la fenetre pose le titre sous lui. On decale de sa hauteur, qu'il publie.
    <section id={id} className="scroll-mt-[calc(var(--banner-h)+1rem)] border-b px-6 py-4">
      <header className="flex items-baseline gap-2 pb-3">
        <h2 className="text-[15px] font-medium tracking-tight">{title}</h2>
        <span className="font-mono text-[12px] tabular-nums text-ink-faint">{count}</span>
        {aside ? <span className={cn("text-[12px]", tone ?? "text-ink-faint")}>{aside}</span> : null}
      </header>
      <div className="flex flex-col gap-4">{children}</div>
    </section>
  );
}
