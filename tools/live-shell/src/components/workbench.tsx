import { At, Mark, type MarkTone, Nothing, StateDot } from "#/components/atoms";
import { PlanGate } from "#/components/plan-gate";
import { QuestionModule } from "#/components/question-module";
import { Maquette, MemoryUpdate, Scouted, TicketSource } from "#/components/sources";
import { Contradictions, Decisions, type Focus, Repos, Review } from "#/components/widgets";
import type { PendingPlan, PendingQuestion, PlanVerdict } from "#/lib/event";
import { DOCKET_LABELS, type Escalation, stepIndex, type Ticket } from "#/lib/ticket";
import type { Check, Todo, TouchedFile, Worksite } from "#/lib/use-live-run";
import { cn } from "#/lib/utils";

/**
 * L'etabli : ce qui se fabrique maintenant.
 *
 * La page a deux registres, et ils ne se melangent plus. A gauche, dans le
 * rail, ce qui est **decide et stable** — le dossier. Ici, sous le bandeau, ce
 * qui est **vivant et perissable** : un lot de questions qui attend, la todo du
 * developer, ce qu'un commit vient de toucher, une checklist qui se remplit.
 *
 * **Ce qui se fabrique ne se replie pas.** Un module repliable devient un module
 * qu'on ne rouvre pas, et on ouvre la revue precisement pour la surveiller ; un
 * module qui ne dit rien disparait a la place. Chacun tient en quelques lignes :
 * c'est un etabli, pas une page a derouler.
 *
 * **Ce qui a ete ingere se replie, et par defaut.** L'enonce du ticket, la
 * maquette, ce que la memoire savait : ce sont des sources, elles ne bougent
 * plus une fois posees, et on y revient quand un arbitrage surprend — pas
 * toutes les dix minutes. Elles vivent dans `sources.tsx` et n'obeissent pas a
 * la regle ci-dessus, parce que celle-ci a ete ecrite pour ce qui bouge. Leur
 * rangee fermee porte un resume : un pli qui n'informe pas est un pli qu'on
 * paie deux fois.
 */

/**
 * Ce qui arrete le run.
 *
 * Rendu au-dessus de tout et dans les deux modes de la colonne : ouvrir une
 * section du dossier ne doit jamais faire disparaitre le lot de questions qui
 * bloque, sinon on lit tranquillement un dossier pendant que le run attend.
 */
export function Blocking({
  ticket,
  question,
  plan,
  onAnswer,
  onDecide,
}: {
  readonly ticket: Ticket;
  readonly question: PendingQuestion | null;
  readonly plan: PendingPlan | null;
  readonly onAnswer: (id: string, answers: Record<string, string>) => Promise<boolean>;
  readonly onDecide: (id: string, verdict: PlanVerdict, note: string) => Promise<boolean>;
}) {
  return (
    <>
      {ticket.run.escalation ? <Halt escalation={ticket.run.escalation} /> : null}
      {question ? <QuestionModule question={question} onAnswer={onAnswer} /> : null}
      <PlanGate ticket={ticket} plan={plan} onDecide={onDecide} />
    </>
  );
}

export interface WorkbenchProps {
  readonly ticket: Ticket;
  readonly step: string;
  readonly blocked: boolean;
  readonly worksites: ReadonlyMap<string, Worksite>;
  readonly focus: Focus | null;
  readonly onFocus: (focus: Focus) => void;
}

/**
 * L'ordre des widgets est fixe, et c'est ce qui les rend lisibles.
 *
 * **Le plus recent en haut, et c'est calcule.** Chaque widget declare le point
 * du workflow qui l'a produit, et la pile se trie par point decroissant. Un
 * ordre tape a la main dans un tableau se defait au premier ajout — quelqu'un
 * insere un widget quelque part, et la page ne raconte plus le run a l'envers
 * mais dans l'ordre ou le fichier a ete edite. Ici la regle est le tri, donc
 * elle tient toute seule.
 *
 * Deux places sont epinglees devant : le plan approuve, rendu au-dessus par
 * `Blocking`, puis la revue. Ce sont les deux blocs qu'on vient voir pendant le
 * cycle, et ils gardent leurs places quoi qu'il arrive. Ils ne suivent pas le
 * defilement — un bloc colle mange le haut de l'ecran pendant qu'on lit autre
 * chose ; c'est leur **position** qui est fixe, pas leur pixel.
 *
 * L'ordre ne change pas avec l'etape : le point est attache au **type** de
 * widget, pas a l'etat du run. Ce qui bouge, c'est seulement ce qui apparait —
 * jamais ou. Chercher a chaque ouverture ou est passe ce qu'on etait venu lire
 * est exactement ce que cette page existe pour supprimer.
 */
export function Workbench({ ticket, step, blocked, worksites, focus, onFocus }: WorkbenchProps) {
  const sites = openSites(worksites);
  const shared = { ticket, focus, onFocus };
  const scope = ticket.scope.filter((repo) => repo.reason || repo.evidence.length > 0);
  // Le point 2 est celui des maquettes : « passe » veut dire strictement apres.
  const searched = stepIndex(ticket.run.step) > stepIndex("2");

  /**
   * Le point qui a produit chaque widget. C'est la seule chose qui decide de
   * l'ordre, et `when` la seule qui decide de la presence — un widget sans
   * matiere n'est pas un widget vide, il n'existe pas.
   */
  const stack: { at: number; when: boolean; node: React.ReactNode }[] = [
    {
      at: 12,
      when: ticket.memoryOperations.length > 0 || ticket.memoryCommit !== null,
      node: <MemoryUpdate key="memory-written" ticket={ticket} />,
    },
    {
      at: 11,
      when: ticket.contradictions.length > 0,
      node: <Contradictions key="contradictions" {...shared} />,
    },
    // Les chantiers sont tous au point 10 : le tri est stable, donc c'est cet
    // ordre-ci qui tient. On le renverse pour que le dernier depot traite soit
    // en tete — c'est celui qu'on vient voir, les precedents sont finis.
    ...[...sites].reverse().map((site) => ({
      at: 10,
      when: true,
      node: <Site key={`site:${site.repo}`} site={site} current={site.repo === ticket.run.currentRepo} />,
    })),
    {
      at: 7,
      when: ticket.technical.length > 0,
      node: (
        <Decisions
          key="technical"
          section="technical"
          title={DOCKET_LABELS.technical}
          entries={ticket.technical}
          focus={focus}
          onFocus={onFocus}
        />
      ),
    },
    ...scouts(ticket),
    { at: 5, when: scope.length > 0, node: <Repos key="scope" {...shared} /> },
    {
      at: 4,
      when: ticket.functional.length > 0,
      node: (
        <Decisions
          key="functional"
          section="functional"
          title={DOCKET_LABELS.functional}
          entries={ticket.functional}
          focus={focus}
          onFocus={onFocus}
        />
      ),
    },
    {
      at: 2,
      // Une URL n'est pas une maquette. `figmaOverrides` est ecrit avant le
      // point 1, des la ligne de commande : le widget apparaissait donc a la
      // seconde zero pour annoncer qu'il n'avait pas l'image d'une maquette
      // que personne n'avait encore ouverte. Il faut soit l'image, soit que le
      // point 2 soit derriere nous — c'est-a-dire que le run ait cherche et
      // qu'une absence veuille enfin dire quelque chose.
      when: ticket.figmaFrames.length > 0 || (searched && ticket.figmaUrls.length > 0),
      node: <Maquette key="maquette" ticket={ticket} />,
    },
    {
      at: 1,
      // Une cle et une URL ne sont pas de la matiere ingeree : elles existent
      // avant que le run ait lu quoi que ce soit, et le bandeau les porte deja.
      when: Boolean(ticket.description || ticket.acceptanceCriteria),
      node: <TicketSource key="ticket" ticket={ticket} />,
    },
  ];

  const shown = stack.filter((entry) => entry.when).sort((a, b) => b.at - a.at);
  const review = ticket.planApprovedAt !== null && ticket.tests.length + ticket.code.length > 0;

  return (
    // `flex-1` n'est pas de la decoration : c'est ce qui donne au vide une
    // hauteur ou se centrer quand il est seul, et ca ne change rien des que la
    // pile a de la matiere — la colonne est alors plus haute que l'ecran.
    <div className="flex flex-1 flex-col">
      {/* Epinglee, et deuxieme : le plan approuve la precede, au-dessus. */}
      <Review {...shared} step={step} />
      {shown.map((entry) => entry.node)}
      {!blocked && !review && shown.length === 0 ? <Quiet /> : null}
    </div>
  );
}

/**
 * Les deux passages du doc-scout, chacun a sa place dans la pile.
 *
 * Le tour large est au point 3 et le tour cible au point 6 : deux widgets
 * separes par tout le cadrage, et c'est exact — entre les deux, le
 * `functional-grill` a interroge et le `scope-scout` a etabli le perimetre. Un
 * seul widget « Memoire » les aurait fusionnes et aurait fait disparaitre le
 * seul endroit ou l'on voit que le second passage a bien eu lieu.
 */
function scouts(ticket: Ticket): { at: number; when: boolean; node: React.ReactNode }[] {
  return ticket.scouted.map((scout) => ({
    at: scout.pass === "ciblee" ? 6 : 3,
    when: true,
    node: <Scouted key={`scouted:${scout.pass}`} scout={scout} />,
  }));
}

/** Une escalade bloque visuellement : on comprend pourquoi sans cliquer. */
function Halt({ escalation }: { escalation: Escalation }) {
  return (
    <section aria-label="Run arrêté" className="border-b border-ko/40 bg-ko/[0.06] px-6 py-4">
      <div className="flex flex-wrap items-baseline gap-2">
        <h2 className="text-[15px] font-medium text-ko">Le run est arrêté</h2>
        <span className="text-[12px] text-ink-faint">à l'étape {escalation.step}</span>
        {escalation.repo ? (
          <span className="font-mono text-[12px] text-ink-faint">{escalation.repo}</span>
        ) : null}
        {escalation.at ? <At iso={escalation.at} className="ml-auto text-[11px] text-ink-faint" /> : null}
      </div>
      <p className="mt-1.5 max-w-[68ch] text-[14px] leading-relaxed text-ink-soft">{escalation.reason}</p>
      <p className="mt-2 max-w-[68ch] text-[13px] leading-relaxed text-ink-faint">
        Rien n'a été publié : ni merge request, ni canal Slack, ni changement de statut Jira. Les commits et
        les tags déjà posés restent en place. Relancer le run reprend exactement ici.
      </p>
    </section>
  );
}

/**
 * Le chantier d'un depot, et il ne s'en va plus.
 *
 * Un seul chantier etait rendu — celui du depot courant — et les precedents
 * disparaissaient en silence a l'ouverture du suivant. Sur un ticket a trois
 * depots, le travail des deux premiers quittait l'ecran au moment meme ou il
 * devenait verifiable : ce qui avait ete touche, ce que les verifications en
 * avaient dit. Ils s'empilent maintenant dans l'ordre de traitement, et le seul
 * repere qui change est le bandeau « en cours » du depot ou l'on travaille.
 *
 * Trois choses par chantier, et pas une de plus : ou en est le developer, ce
 * qu'il a touche, et ce que les verifications en disent. Le contenu des diffs
 * n'est pas ici — il se lit dans la merge request, et le recopier ferait de
 * cette page un client git de plus.
 */
function Site({ site, current }: { site: Worksite; current: boolean }) {
  return (
    <Module title="Développement" aside={site.repo} badge={current ? "en cours" : null}>
      {site.todos.length > 0 ? <TodoList todos={site.todos} /> : null}

      {site.files.length > 0 ? (
        <div className="flex flex-col gap-1.5">
          <Legend>
            {site.files.length} fichier{site.files.length > 1 ? "s" : ""} touché
            {site.files.length > 1 ? "s" : ""}
            {site.commits > 0 ? `, ${site.commits} commit${site.commits > 1 ? "s" : ""}` : ""}
          </Legend>
          {/* La liste defile plutot que d'etre coupee : quarante fichiers
              restent quarante fichiers, et le module reste court. */}
          <ul className="flex max-h-56 flex-col overflow-y-auto">
            {site.files.map((file) => (
              <Touched key={file.path} file={file} />
            ))}
          </ul>
        </div>
      ) : null}

      {site.checks.length > 0 ? <Checks checks={site.checks} /> : null}
    </Module>
  );
}

/** Le vocabulaire de `TodoWrite`, dans celui des carres. */
const TODO_TONE: Record<string, MarkTone> = {
  completed: "done",
  in_progress: "running",
  pending: "todo",
};

function TodoList({ todos }: { todos: readonly Todo[] }) {
  const done = todos.filter((todo) => todo.status === "completed").length;
  return (
    <div className="flex flex-col gap-1.5">
      <Legend>
        Todo du developer
        <span className="font-mono tabular-nums">
          {done}/{todos.length}
        </span>
      </Legend>
      <ul className="flex flex-col gap-1">
        {todos.map((todo) => (
          <li key={todo.text} className="flex items-baseline gap-2 text-[13px] leading-relaxed">
            {/* Le carre de la revue, pas une pastille a lui : une ligne qui
                attend, une ligne sur laquelle on travaille et une ligne rendue
                se lisent pareil partout dans la page. */}
            <Mark tone={TODO_TONE[todo.status] ?? "todo"} className="translate-y-[1px]" />
            <span
              className={cn(
                "min-w-0 flex-1",
                todo.status === "completed"
                  ? "text-ink-faint"
                  : todo.status === "in_progress"
                    ? "text-ink"
                    : "text-ink-soft",
              )}
            >
              {todo.text}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Touched({ file }: { file: TouchedFile }) {
  return (
    <li className="flex items-baseline gap-3 border-b border-line-soft py-1 text-[12px] last:border-b-0">
      <code className="min-w-0 flex-1 truncate font-mono text-ink-soft">{file.path}</code>
      {/* Un nombre de lignes est une mesure, pas un etat. Le vert et le rouge
          de git diraient ici « passe » et « casse » — les deux seuls sens que
          ces couleurs ont dans cette page. Le signe suffit a dire le sens. */}
      <span className="w-12 shrink-0 text-right font-mono tabular-nums text-ink-faint">
        {file.added ? `+${file.added}` : ""}
      </span>
      <span className="w-12 shrink-0 text-right font-mono tabular-nums text-ink-faint">
        {file.removed ? `−${file.removed}` : ""}
      </span>
    </li>
  );
}

function Checks({ checks }: { checks: readonly Check[] }) {
  return (
    <div className="flex flex-col gap-1.5">
      <Legend>Vérifications</Legend>
      <ul className="flex flex-wrap gap-x-5 gap-y-1 text-[12px]">
        {checks.map((check) => (
          <li key={check.kind} className="flex items-baseline gap-1.5">
            <StateDot status={check.passed ? "passed" : "failed"} />
            <span className="font-mono text-ink-soft">{check.kind}</span>
            <span className={check.passed ? "text-ok" : "text-ko"}>{check.passed ? "passe" : "échoue"}</span>
            {check.durationMs !== null ? (
              <span className="font-mono tabular-nums text-ink-faint">{seconds(check.durationMs)}</span>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * L'etabli vide, et c'est un etat, pas un trou.
 *
 * Centre sur les deux axes du vide qu'il occupe : un run qui n'a encore rien
 * pousse a une page qui a l'air finie, pas une page qui a l'air coupee. Une
 * phrase de deux lignes vivait ici, a la place ou un widget se lit et dans son
 * alignement — donc on la lisait comme du contenu, et on cherchait ce qu'elle
 * voulait de nous. Un dessin occupe ce vide sans se faire lire, et la ligne
 * dessous suffit a dire pourquoi il est la.
 *
 * Elle ne nomme ni l'etape ni ce qui a deja ete tranche : le bandeau porte
 * l'etape juste au-dessus, le dossier porte les decisions juste a gauche, et
 * les deux sont a l'ecran a l'instant ou on lit ca. Recopier l'un des deux
 * aurait fait une phrase a maintenir a chaque changement d'etape.
 *
 * **Le dessin est au trait et en gris, et c'est ce qui le rend portable.** Il
 * s'inverse en sombre plutot que d'exister en deux fichiers a tenir en phase —
 * le ciel de jour devient un ciel de nuit, et aucune couleur d'etat n'est
 * empruntee au passage. Il est decoratif, donc `alt` est vide : ce qu'il y a a
 * comprendre est ecrit dessous, et le faire lire deux fois est une gene.
 */
function Quiet() {
  return (
    <section className="flex flex-1 flex-col items-center justify-center gap-5 px-6 py-16">
      <img
        src="/empty-sky.png"
        alt=""
        width={475}
        height={415}
        className="w-52 max-w-full opacity-90 dark:invert"
      />
      <Nothing>Le run n'a encore rien ingéré ni produit.</Nothing>
    </section>
  );
}

/**
 * L'enveloppe d'un module.
 *
 * Un titre sur un filet, et c'est tout : pas de carte, pas de fond, pas de
 * rayon. Ce qui separe deux modules, c'est le filet du suivant.
 */
function Module({
  title,
  aside,
  badge,
  children,
}: {
  title: string;
  aside?: string | null;
  /** Ce qui distingue ce module des autres du meme titre. */
  badge?: string | null;
  children: React.ReactNode;
}) {
  return (
    <section className="border-b px-6 py-4">
      <header className="flex items-baseline gap-2 pb-3">
        <h2 className="text-[15px] font-medium tracking-tight">{title}</h2>
        {aside ? <span className="font-mono text-[12px] text-ink-faint">{aside}</span> : null}
        {badge ? <span className="text-[11px] uppercase tracking-wide text-ink-faint">{badge}</span> : null}
      </header>
      <div className="flex flex-col gap-4">{children}</div>
    </section>
  );
}

function Legend({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="flex items-baseline gap-1.5 text-[11px] font-medium uppercase tracking-wide text-ink-faint">
      {children}
    </h3>
  );
}

function seconds(ms: number): string {
  return ms < 1000 ? `${ms}ms` : `${Math.round(ms / 100) / 10}s`;
}

/**
 * Tous les chantiers ouverts, dans l'ordre ou le run les a ouverts.
 *
 * L'ordre vient de la Map, qui est celle des evenements : c'est l'ordre des
 * `level` du registre, amont vers aval, donc celui dans lequel le travail s'est
 * fait. Le relire de haut en bas raconte le run.
 *
 * Un chantier vide n'est pas un chantier — tant qu'aucun agent n'a pousse de
 * todo, de commit ni de verification, le module n'existe pas. C'est la seule
 * raison pour laquelle un chantier peut ne pas etre la ; une fois pose, il
 * reste.
 */
function openSites(worksites: ReadonlyMap<string, Worksite>): Worksite[] {
  return [...worksites.values()].filter(
    (site) => site.todos.length > 0 || site.files.length > 0 || site.checks.length > 0,
  );
}
