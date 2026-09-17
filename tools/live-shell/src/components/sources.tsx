import { useState } from "react";
import { At, Caret, Nothing } from "#/components/atoms";
import type { FigmaFrame, MemoryOperation, MemoryScout, Ticket } from "#/lib/ticket";
import { cn } from "#/lib/utils";

/**
 * Ce que le run a **ingere**, par opposition a ce qu'il produit.
 *
 * L'etabli montrait les decisions sans jamais montrer ce sur quoi elles avaient
 * ete prises. On lisait « le ticket fait foi : 30 / 30 / 25 / 15 » sans pouvoir
 * verifier ce que le ticket disait, ni ce que la maquette montrait, ni si la
 * memoire avait ete lue. Quatre widgets pour quatre sources : l'enonce, la
 * maquette, ce que la memoire savait, ce que le run lui a appris.
 *
 * **C'est le seul registre de la page qui se replie**, et la regle « aucun
 * module ne se replie » tient toujours pour l'autre. Elle a ete ecrite pour ce
 * qui bouge : une revue repliee est une revue qu'on ne rouvre pas, alors qu'on
 * l'ouvre precisement pour la surveiller. Une source ne bouge plus une fois
 * posee — on y revient quand un arbitrage surprend, pas toutes les dix minutes.
 * Repliee par defaut, elle ne coute rien aux trois heures pendant lesquelles on
 * ne la lit pas.
 *
 * Ce qui impose une chose : **la rangee fermee doit informer**. « Maquette »
 * seul n'est qu'une invitation a cliquer ; « Maquette — 1 frame, popup ouverte »
 * repond souvent sans qu'on ouvre. Chaque widget rend donc un resume d'une
 * ligne, et c'est lui qui porte le vide quand il y en a un.
 */

/**
 * L'enveloppe pliee.
 *
 * Le patron vient du plan approuve (`plan-gate.tsx`), qui se replie depuis
 * toujours et dans ce monde-ci : une rangee, un caret, un titre, une meta a
 * droite, et le contenu reel en dessous. Deux plis differents pour le meme
 * geste, c'est le recoupement que cette page existe pour supprimer.
 */
function Fold({
  id,
  title,
  summary,
  tone,
  meta,
  at,
  children,
}: {
  id: string;
  title: string;
  /** Ce que la rangee fermee dit toute seule. Jamais vide. */
  summary: string;
  /** L'ambre de derive quand le resume signale quelque chose a regarder. */
  tone?: string | null;
  meta?: string | null;
  at?: string | null;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);

  return (
    // `scroll-mt` : le bandeau est collant, comme pour les autres widgets.
    <section id={id} className="scroll-mt-[calc(var(--banner-h)+1rem)] border-b px-6 py-2.5">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="flex w-full items-baseline gap-2 rounded-sm text-left text-[13px] text-ink-soft hover:text-ink"
      >
        <Caret open={open} className="translate-y-[2px]" />
        <span className="shrink-0 font-medium">{title}</span>
        <span className={cn("min-w-0 flex-1 truncate text-[12px]", tone ?? "text-ink-faint")}>{summary}</span>
        {meta ? (
          <span className="shrink-0 font-mono text-[12px] tabular-nums text-ink-faint">{meta}</span>
        ) : null}
        {at ? <At iso={at} className="shrink-0 text-[11px] text-ink-faint" /> : null}
      </button>

      {open ? <div className="flex flex-col gap-5 pt-4 pb-2">{children}</div> : null}
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

/**
 * Une ligne de liste : un emplacement en monospace, ce qu'on y lit en prose.
 *
 * La meme coupe que les preuves du scope-scout, et pour la meme raison — un
 * chemin est une adresse, pas une phrase.
 *
 * `min-w-[24ch]` sur la prose est ce qui tient la ligne au telephone. Sans lui
 * elle prend ce qui reste a droite du chemin — parfois trois centimetres — et
 * une phrase de quinze mots y descend en colonne d'un mot de large.
 */
function Row({ where, what }: { where: string; what?: string | null }) {
  return (
    <li className="flex flex-wrap items-baseline gap-x-2 border-b border-line-soft py-1 text-[12px] last:border-b-0">
      <code className="font-mono text-ink">{where}</code>
      {what ? <span className="min-w-[24ch] flex-1 text-ink-faint">{what}</span> : null}
    </li>
  );
}

// -------------------------------------------------------------------- ticket ----

/**
 * L'enonce, tel que le run l'a lu.
 *
 * Il n'est pas rappele a Jira : la page ne sort pas sur le reseau, et le ticket
 * a pu bouger depuis. Ce qui est montre ici est **ce sur quoi le run a
 * travaille**, ce qui est la seule version qui explique ses decisions.
 *
 * Ni le titre ni la cle ne sont repris : ils sont dans le bandeau, en
 * permanence, et les reecrire ici ferait deux sources pour une meme chose.
 */
export function TicketSource({ ticket }: { ticket: Ticket }) {
  const criteria = lines(ticket.acceptanceCriteria);
  // Il faut de la matiere ingeree, pas seulement un ticket. Une cle et une URL
  // existent des la premiere seconde du run et sont deja dans le bandeau : un
  // widget qui n'aurait qu'elles dirait « le ticket n'a pas de description » a
  // propos d'un run qui, simplement, ne l'a pas encore ecrite. Une absence
  // affirmee a partir d'un champ vide est un mensonge qu'on croit.
  if (!ticket.description && criteria.length === 0) return null;

  const said = [
    ticket.type,
    ticket.jiraStatus,
    criteria.length > 0
      ? `${criteria.length} critère${criteria.length > 1 ? "s" : ""} d'acceptation`
      : "sans critère d'acceptation écrit",
  ].filter(Boolean);

  return (
    <Fold
      id="widget-source-ticket"
      title="Ticket"
      summary={said.join(" · ")}
      tone={criteria.length === 0 ? "text-drift" : null}
    >
      {ticket.description ? (
        // Borne a la mesure de lecture de la page — 68ch, la meme que partout
        // ailleurs. Les widgets ne bornent pas leurs entrees, et c'est juste :
        // un arbitrage tient en deux lignes et gagne a courir sur la largeur.
        // Une description de ticket est un document, pas une entree, et un
        // document lu sur cent-cinquante caracteres se relit deux fois par
        // paragraphe. La marge a droite reste une marge : rien ne s'y pose.
        <div className="max-h-96 overflow-y-auto">
          <p className="max-w-[68ch] whitespace-pre-wrap text-[14px] leading-relaxed text-ink-soft">
            {ticket.description}
          </p>
        </div>
      ) : (
        <Nothing>
          Le ticket n'a pas de description — tout vient donc de la maquette et des arbitrages.
        </Nothing>
      )}

      {criteria.length > 0 ? (
        <div className="flex flex-col gap-1.5">
          <Legend>
            Critères d'acceptation
            <span className="font-mono tabular-nums">{criteria.length}</span>
          </Legend>
          <ul className="flex flex-col">
            {criteria.map((line) => (
              <li
                key={line}
                className="max-w-[68ch] border-b border-line-soft py-1.5 text-[13px] leading-relaxed text-ink-soft last:border-b-0"
              >
                {line}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {ticket.url ? <Source href={ticket.url}>Ouvrir le ticket dans Jira</Source> : null}
    </Fold>
  );
}

// ------------------------------------------------------------------ maquette ----

/**
 * La maquette, en pixels.
 *
 * Une arborescence `Dialog > Title / content / buttons` nomme les composants ;
 * elle ne dit pas si on a compris la meme chose que le designer. C'est
 * justement la ou le ticket et la maquette se contredisent que l'arbitrage se
 * joue — sur FT-1042, les valeurs par defaut differaient entre les deux, et
 * trancher demandait de voir les deux.
 *
 * Le PNG est servi depuis `~/.autopilot`, pas depuis Figma : l'URL de rendu
 * expire, et le navigateur n'a pas de jeton.
 */
export function Maquette({ ticket }: { ticket: Ticket }) {
  const frames = ticket.figmaFrames;
  // Une URL referencee sans frame lue n'est pas une absence de maquette : le
  // run a travaille en aveugle sur une maquette qui existe, et le taire
  // laisserait croire que le ticket n'en avait pas.
  //
  // Ca ne devient vrai qu'une fois le point 2 passe, et **c'est l'etabli qui en
  // decide** : lui seul connait l'etape. Avant, une URL ne dit rien de plus que
  // « quelqu'un a colle un lien », et l'annoncer illisible serait affirmer un
  // echec la ou personne n'a encore regarde.
  const referenced = ticket.figmaUrls;
  if (frames.length === 0 && referenced.length === 0) return null;

  if (frames.length === 0) {
    return (
      <Fold
        id="widget-source-maquette"
        title="Maquette"
        summary={`${referenced.length} référencée${referenced.length > 1 ? "s" : ""}, aucune image`}
        tone="text-drift"
      >
        {/* On dit le fait, pas sa cause. La page ne peut pas distinguer un
            jeton Figma absent d'une frame que le run n'a pas capturee, et
            trancher entre les deux serait inventer. Le geste de rattrapage est
            le meme dans les deux cas : ouvrir le lien. */}
        <p className="max-w-[68ch] text-[14px] leading-relaxed text-drift">
          Le ticket porte une maquette, mais la page n'en a pas l'image. Ce qui a été décidé en la regardant
          ne peut pas être vérifié ici — il faut l'ouvrir dans Figma.
        </p>
        <ul className="flex flex-col">
          {referenced.map((url) => (
            <li key={url} className="border-b border-line-soft py-1 text-[12px] last:border-b-0">
              <Source href={url}>{url}</Source>
            </li>
          ))}
        </ul>
      </Fold>
    );
  }

  const named = frames.find((frame) => frame.name)?.name;

  return (
    <Fold
      id="widget-source-maquette"
      title="Maquette"
      summary={named ?? `${frames.length} frame${frames.length > 1 ? "s" : ""}`}
      meta={frames.length > 1 ? `${frames.length} frames` : null}
    >
      {frames.map((frame) => (
        <Frame key={frame.url + (frame.nodeId ?? "")} frame={frame} />
      ))}
    </Fold>
  );
}

function Frame({ frame }: { frame: FigmaFrame }) {
  return (
    <figure className="flex flex-col gap-2">
      {frame.image ? (
        // Le seul raster de la page. Il se pose donc comme tout le reste : un
        // filet, un fond de champ, et rien d'autre — pas d'ombre, pas de rayon
        // qui en ferait une carte au milieu d'une page qui n'en a aucune.
        <div className="flex max-h-[60vh] justify-center overflow-hidden border border-line bg-field p-2">
          <img
            src={`/maquette/${encodeURIComponent(frame.image)}`}
            alt={frame.name ? `Maquette : ${frame.name}` : "Maquette du ticket"}
            className="max-h-[calc(60vh-1rem)] w-auto max-w-full object-contain"
          />
        </div>
      ) : (
        <Nothing>Cette frame a été repérée mais son image n'a pas été rendue.</Nothing>
      )}

      <figcaption className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-[12px]">
        {frame.name ? <span className="text-ink-soft">{frame.name}</span> : null}
        {frame.nodeId ? <code className="font-mono text-ink-faint">{frame.nodeId}</code> : null}
        <Source href={frame.url} className="ml-auto">
          Ouvrir dans Figma
        </Source>
      </figcaption>

      {frame.outline.length > 0 ? <Outline lines={frame.outline} /> : null}
    </figure>
  );
}

/**
 * L'arborescence des composants, sous l'image.
 *
 * Elle est pliee parce que l'image repond deja a la question qu'on se pose en
 * ouvrant la maquette ; elle sert a nommer les composants quand on code, ce qui
 * est un autre moment. Elle porte le meme caret que tout le reste — une page
 * qui a deux langages de depliage en fait apprendre deux, et le second se
 * decouvre par accident.
 */
function Outline({ lines }: { lines: readonly string[] }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="flex flex-col">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="flex items-center gap-1.5 self-start rounded-sm text-[11px] font-medium uppercase tracking-wide text-ink-faint hover:text-ink-soft"
      >
        <Caret open={open} className="size-2.5" />
        Arborescence des composants
      </button>
      {open ? (
        <pre className="mt-2 max-h-56 overflow-auto whitespace-pre font-mono text-[11px] leading-relaxed text-ink-faint">
          {lines.join("\n")}
        </pre>
      ) : null}
    </div>
  );
}

// -------------------------------------------------------------------- memoire ----

const PASS_LABEL = {
  large: "tour large",
  ciblee: "tour ciblé",
} as const;

/**
 * Ce que la memoire savait deja, a un des deux passages.
 *
 * Deux widgets, jamais un : le tour large cherche le sujet du ticket sans
 * connaitre les depots, le tour cible ne lit que ceux qui ont ete retenus. Les
 * fusionner dirait que la memoire a ete consultee une fois, et perdrait le seul
 * endroit ou l'on voit que le second passage a bien eu lieu.
 *
 * **Ce que la memoire ne dit pas est rendu a egalite de ce qu'elle dit.** C'est
 * le cas courant aujourd'hui, et c'est une information sur le run, pas un vide
 * a masquer : une planification qui avance sans filet doit se voir.
 */
export function Scouted({ scout }: { scout: MemoryScout }) {
  const { notes, silentOn } = scout;
  if (notes.length === 0 && silentOn.length === 0 && scout.filesRead === null) return null;

  const read =
    scout.filesRead !== null
      ? `${scout.filesRead} fichier${scout.filesRead > 1 ? "s" : ""} lu${scout.filesRead > 1 ? "s" : ""}`
      : null;
  const kept =
    notes.length > 0
      ? `${notes.length} note${notes.length > 1 ? "s" : ""} retenue${notes.length > 1 ? "s" : ""}`
      : "aucune note sur le sujet";

  return (
    <Fold
      id={`widget-source-memoire-${scout.pass}`}
      title={`Mémoire retenue, ${PASS_LABEL[scout.pass]}`}
      summary={[read, kept].filter(Boolean).join(" · ")}
      tone={notes.length === 0 ? "text-drift" : null}
      at={scout.at}
    >
      {notes.length > 0 ? (
        <div className="flex flex-col gap-1.5">
          <Legend>
            Ce que la mémoire savait déjà
            <span className="font-mono tabular-nums">{notes.length}</span>
          </Legend>
          <ul className="flex flex-col">
            {notes.map((note) => (
              <Row key={note.path} where={note.path} what={note.says} />
            ))}
          </ul>
        </div>
      ) : (
        <Nothing>
          La mémoire a été parcourue et n'avait rien sur le sujet. Tout ce qui suit a donc été tranché sans
          précédent — c'est exactement ce que ce run va lui apprendre.
        </Nothing>
      )}

      {silentOn.length > 0 ? (
        <div className="flex flex-col gap-1.5">
          <Legend>Ce qu'elle ne dit pas</Legend>
          <ul className="flex flex-col">
            {silentOn.map((gap) => (
              <li
                key={gap}
                className="max-w-[68ch] border-b border-line-soft py-1 text-[12px] leading-relaxed text-ink-faint last:border-b-0"
              >
                {gap}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </Fold>
  );
}

// ----------------------------------------------------- mise a jour memoire ----

const OP_LABEL: Record<MemoryOperation["op"], { one: string; many: string }> = {
  create: { one: "créée", many: "créées" },
  update: { one: "réécrite", many: "réécrites" },
  delete: { one: "supprimée", many: "supprimées" },
};

const OP_ORDER: readonly MemoryOperation["op"][] = ["create", "update", "delete"];

/**
 * Ce que le run a appris, et ce qu'il a desappris.
 *
 * Le sha du commit disait qu'il s'etait passe quelque chose sans dire quoi.
 * C'est pourtant la seule sortie du run qui survit au ticket : les MR se
 * ferment, la memoire reste et sert au run suivant. Une suppression vaut donc
 * d'etre lue autant qu'une creation — c'est une note qui a menti.
 *
 * Aucune couleur ici. Les quatre teintes de la page disent ce qui passe, ce qui
 * casse, ce qui attend et ce qui derive ; une suppression n'est aucun des
 * quatre, et la peindre en rouge en ferait un echec.
 */
export function MemoryUpdate({ ticket }: { ticket: Ticket }) {
  const operations = ticket.memoryOperations;
  if (operations.length === 0 && !ticket.memoryCommit) return null;

  const tally = OP_ORDER.map((op) => {
    const count = operations.filter((entry) => entry.op === op).length;
    return count > 0 ? `${count} ${count > 1 ? OP_LABEL[op].many : OP_LABEL[op].one}` : null;
  }).filter(Boolean);

  return (
    <Fold
      id="widget-source-memoire-ecrite"
      title="Mise à jour de la mémoire"
      summary={tally.length > 0 ? tally.join(" · ") : "commit posé, aucune opération détaillée"}
      tone={tally.length === 0 ? "text-drift" : null}
      meta={ticket.memoryCommit ? ticket.memoryCommit.slice(0, 8) : null}
    >
      {operations.length === 0 ? (
        <Nothing>
          La mémoire a été committée mais l'état du ticket n'en garde pas le détail. Le commit se relit avec{" "}
          <code className="font-mono">git show</code> dans{" "}
          <code className="font-mono">~/.autopilot/memory</code>.
        </Nothing>
      ) : (
        OP_ORDER.map((op) => {
          const group = operations.filter((entry) => entry.op === op);
          if (group.length === 0) return null;
          return (
            <div key={op} className="flex flex-col gap-1.5">
              <Legend>
                {group.length > 1 ? OP_LABEL[op].many : OP_LABEL[op].one}
                <span className="font-mono tabular-nums">{group.length}</span>
              </Legend>
              <ul className="flex flex-col">
                {group.map((entry) => (
                  <Row key={`${op}:${entry.path}`} where={entry.path} what={entry.why} />
                ))}
              </ul>
            </div>
          );
        })
      )}

      {ticket.memoryCommit ? (
        <p className="text-[12px] text-ink-faint">
          Un seul commit, <code className="font-mono text-ink">{ticket.memoryCommit.slice(0, 8)}</code> — il
          se <code className="font-mono">revert</code> d'un bloc si le run a mal appris.
        </p>
      ) : (
        <Nothing>Rien n'a encore été committé : la mémoire sur disque ne porte pas ces changements.</Nothing>
      )}
    </Fold>
  );
}

// ----------------------------------------------------------------- primitives ----

/**
 * Un lien sortant.
 *
 * Souligne avec un decalage, parce qu'un lien qui ne se distingue que par sa
 * couleur n'existe pas pour qui ne la voit pas — et parce que la seule couleur
 * disponible ici voudrait dire un etat.
 */
function Source({
  href,
  className,
  children,
}: {
  href: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className={cn(
        "inline-block max-w-full truncate rounded-sm text-[12px] text-ink-soft underline decoration-line underline-offset-[3px] hover:text-ink hover:decoration-ink-faint",
        className,
      )}
    >
      {children}
    </a>
  );
}

/** Les criteres d'acceptation arrivent en un bloc ; un par ligne non vide. */
function lines(block: string | null): string[] {
  if (!block) return [];
  return block
    .split("\n")
    .map((line) => line.replace(/^\s*[-*•]\s*/, "").trim())
    .filter((line) => line.length > 0);
}
