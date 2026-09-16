import { useEffect, useRef } from "react";
import { Elapsed, ProgressDot, type RunMark, useNow } from "#/components/atoms";
import type { LiveEvent, PendingQuestion } from "#/lib/event";
import { STEPS, stepIndex, type Ticket } from "#/lib/ticket";
import type { Connection } from "#/lib/use-live-run";

/**
 * Le bandeau d'etat, en deux niveaux.
 *
 * C'est la seule chose qu'on lit quand on ouvre l'onglet a froid apres une
 * heure, et la seule qui survive a une capture collee dans un channel. D'ou la
 * separation, qui est tout le dessin :
 *
 * - **Niveau 1, le vocabulaire du shell.** Un des treize libelles d'etape,
 *   jamais ecrit par un agent, donc toujours lisible. Sa forme ne change
 *   jamais : c'est ce qui rend la lecture a froid possible.
 * - **Niveau 2, le vocabulaire de l'agent.** Sa phrase, rendue entiere. Elle
 *   peut etre mauvaise ou longue — la page ne la reecrit pas, elle la met a
 *   l'etage ou une mauvaise phrase ne coute que sa ligne.
 *
 * Le sol prend une teinte indigo tres basse. Elle ne dit rien de l'etat : elle
 * detache le bandeau du dossier, et c'est tout ce qu'on lui demande.
 */

/** Cinq minutes sans event, agent au travail : ca merite d'etre dit. */
const SILENCE_MS = 5 * 60 * 1000;

export interface BannerProps {
  readonly ticket: Ticket;
  /**
   * L'etape recoupee, pas `ticket.run.step`.
   *
   * Le YAML est ecrit apres coup : lu seul, il affichait « Lecture du ticket »
   * pendant qu'un tout autre agent travaillait, avec le chrono de la vraie
   * etape a cote. Un libelle perime et une duree vivante sur la meme ligne,
   * c'est la seule facon de rendre un bandeau d'etat inutilisable.
   */
  readonly step: string;
  /** Le dernier event qui n'est pas une question : les questions ont leur module. */
  readonly current: LiveEvent | null;
  /** Le lot en attente, s'il y en a un. Le bandeau le nomme, il ne le recopie pas. */
  readonly question: PendingQuestion | null;
  readonly mark: RunMark;
  readonly stepSince: string | null;
  readonly connection: Connection;
}

export function Banner({ ticket, step: raw, current, question, mark, stepSince, connection }: BannerProps) {
  const here = stepIndex(raw);
  const step = here >= 0 ? STEPS[here] : null;
  const agentry = [current?.agent, current?.tool].filter(Boolean).join(" · ");
  // Le mot n'est pas décoratif : à droite d'un libellé d'étape, `doc-scout` tout
  // seul se lit comme une sous-étape. Il dit de quelle nature est ce nom.
  const named = Boolean(current?.agent);
  const frame = useMeasuredHeight();

  return (
    <header
      ref={frame}
      className="sticky top-0 z-20 border-b border-primary-line bg-primary-surface/95 px-6 py-3 backdrop-blur"
    >
      <div className="flex items-center gap-2.5">
        <ProgressDot state={mark} />
        <h1 className="min-w-0 flex-1 truncate text-[14px] font-medium tracking-tight">
          {step?.label ?? "En attente du premier événement"}
          <span className="sr-only">{step ? `, étape ${step.id} sur ${STEPS.length}` : ""}</span>
        </h1>

        {agentry ? (
          <span className="hidden shrink-0 font-mono text-[12px] text-primary-faint md:inline">
            {named ? <span className="opacity-65">agent - </span> : null}
            {agentry}
          </span>
        ) : null}

        {/* La durée de l'étape — pas celle du dernier event. C'est le seul
            signal de dérive temporelle de la page, donc c'est le chiffre le
            plus fort du bandeau : vingt minutes doivent se remarquer sans
            qu'on les cherche. */}
        {stepSince ? (
          <Elapsed
            since={stepSince}
            className="shrink-0 text-[12px] font-medium leading-none tracking-tight"
          />
        ) : null}
      </div>

      <div className="flex min-w-0 flex-col gap-1 pl-[1.375rem] pt-1">
        <p className="text-[14px] leading-snug text-ink-soft">
          <Lead ticket={ticket} mark={mark} />
          {question ? waiting(question) : (current?.title ?? "Le run n'a pas encore commencé.")}
        </p>

        {/* Le titre est borné à l'écriture ; quand il a été coupé, le texte
            entier vit dans le detail. On le montre plutôt que de laisser croire
            que la phrase s'arrête là.

            Rien de tout ça pendant qu'un lot attend : son module est juste en
            dessous, en pleine largeur. Un bandeau qui recopie six questions
            qu'on lit déjà sous lui n'ajoute pas une information, il en retire
            une — celle qu'il était le seul à porter.

            Rien non plus pour un lot répondu, et c'est la même règle vue de
            l'autre côté : le detail d'un `answer` est la recopie intégrale des
            six arbitrages, qui sont déjà dans le dossier et qui y restent. Le
            bandeau dit ce qui se passe, pas ce qui a été décidé — six blocs de
            décision collés dans un en-tête d'état le repoussent hors de
            l'écran, et c'était la seule chose qu'on venait y lire. */}
        {current?.detail && !question && current.kind !== "answer" ? (
          <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-primary-faint">
            {current.detail}
          </p>
        ) : null}

        <Aside current={current} mark={mark} stepSince={stepSince} connection={connection} />
      </div>
    </header>
  );
}

/**
 * Ce que le bandeau dit d'un lot en attente.
 *
 * Une phrase du shell, jamais celle de l'agent : elle doit compter les
 * questions et dire ou elles sont, pas les enoncer. C'est la difference entre
 * un en-tete d'etat et un deuxieme exemplaire du module.
 */
function waiting(question: PendingQuestion): string {
  const count = question.questions.length;
  const where = question.answerable ? "juste en dessous" : "dans le terminal";
  return count > 1 ? `${count} questions à trancher, ${where}.` : `Une question à trancher, ${where}.`;
}

/**
 * Ce qui ouvre la deuxieme ligne.
 *
 * Quand le run tourne, c'est la cle du ticket : une capture doit dire de quel
 * ticket elle parle sans legende. Quand il s'arrete, c'est le mot de l'etat —
 * un etat se lit a la couleur **et** au mot, une pastille seule ne suffit pas,
 * et c'est exactement la ou la couleur seule laisserait passer le plus cher.
 */
function Lead({ ticket, mark }: { ticket: Ticket; mark: RunMark }) {
  if (mark === "error") return <strong className="font-medium text-ko">Le run est arrêté — </strong>;
  if (mark === "human") return <strong className="font-medium text-human">Le run t'attend — </strong>;
  if (mark === "done") return <strong className="font-medium text-ok">Le run est terminé — </strong>;

  if (!ticket.key) return null;
  return (
    <>
      {ticket.url ? (
        <a href={ticket.url} className="font-mono font-medium text-ink hover:underline">
          {ticket.key}
        </a>
      ) : (
        <span className="font-mono font-medium text-ink">{ticket.key}</span>
      )}
      <span className="px-1.5 text-primary-faint">·</span>
    </>
  );
}

/**
 * Les deux choses qui ne sont pas l'etat du run.
 *
 * L'age du dernier event ne s'affiche que quand il devient un silence, et
 * seulement pendant qu'un agent est cense travailler : un run qui t'attend est
 * silencieux par construction, le dire serait du bruit. Le flux coupe est un
 * probleme du shell, pas du run — il a sa propre ligne pour qu'on ne le prenne
 * pas pour une panne d'autopilot.
 */
function Aside({
  current,
  mark,
  stepSince,
  connection,
}: {
  current: LiveEvent | null;
  mark: RunMark;
  stepSince: string | null;
  connection: Connection;
}) {
  const now = useNow();
  // Quand le dernier event est celui qui a ouvert l'etape, ce silence est deja
  // dit par la duree d'etape, en plus gros. Deux chiffres pour une seule chose
  // font croire qu'il y en a deux.
  const silent =
    mark === "running" &&
    current !== null &&
    current.ts !== stepSince &&
    now - Date.parse(current.ts) > SILENCE_MS;

  if (!silent && connection !== "closed") return null;

  return (
    <p className="flex flex-wrap items-baseline gap-x-4 text-[12px]">
      {connection === "closed" ? (
        <span className="text-ko">Flux interrompu — la page ne suit plus le run. Le run, lui, continue.</span>
      ) : null}
    </p>
  );
}

/**
 * Le bandeau publie sa hauteur, parce qu'il n'en a pas une.
 *
 * Il fait deux lignes, trois quand la phrase d'un agent passe a la ligne, et
 * quatre quand un silence s'ajoute. Ce qui doit se coller dessous — l'en-tete du
 * module de questions — ne peut donc pas recopier un nombre. Il lit
 * `--banner-h`, que le bandeau tient a jour lui-meme.
 *
 * La valeur par defaut vit dans la feuille de style : le rendu serveur n'a pas
 * de `ResizeObserver`, et la premiere frame doit deja etre juste.
 */
function useMeasuredHeight() {
  const frame = useRef<HTMLElement>(null);

  useEffect(() => {
    const node = frame.current;
    if (!node) return;
    const publish = () => document.documentElement.style.setProperty("--banner-h", `${node.offsetHeight}px`);
    publish();
    const watch = new ResizeObserver(publish);
    watch.observe(node);
    return () => watch.disconnect();
  }, []);

  return frame;
}
