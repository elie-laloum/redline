import { Elapsed, type RunMark, StateMark, useNow } from "#/components/atoms";
import type { LiveEvent } from "#/lib/event";
import { STEPS, type Ticket, stepIndex } from "#/lib/ticket";
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
  readonly current: LiveEvent | null;
  readonly mark: RunMark;
  readonly stepSince: string | null;
  readonly connection: Connection;
}

export function Banner({ ticket, current, mark, stepSince, connection }: BannerProps) {
  const here = stepIndex(ticket.run.step);
  const step = here >= 0 ? STEPS[here] : null;
  const agentry = [current?.agent, current?.tool].filter(Boolean).join(" · ");

  return (
    <header className="sticky top-0 z-20 border-b border-primary-line bg-primary-surface/95 px-6 py-3 backdrop-blur">
      <div className="flex items-center gap-2.5">
        <StateMark mark={mark} />
        <h1 className="min-w-0 flex-1 truncate text-[14px] font-medium tracking-tight">
          {step?.label ?? "En attente du premier événement"}
          <span className="sr-only">
            {step ? `, étape ${step.id} sur ${STEPS.length}` : ""}
          </span>
        </h1>

        {agentry ? (
          <span className="hidden shrink-0 font-mono text-[12px] text-primary-faint md:inline">{agentry}</span>
        ) : null}

        {/* La durée de l'étape — pas celle du dernier event. C'est le seul
            signal de dérive temporelle de la page, donc c'est le chiffre le
            plus fort du bandeau : vingt minutes doivent se remarquer sans
            qu'on les cherche. */}
        {stepSince ? (
          <Elapsed since={stepSince} className="shrink-0 text-[12px] font-medium leading-none tracking-tight" />
        ) : null}
      </div>

      <div className="flex min-w-0 flex-col gap-1 pl-[1.375rem] pt-1">
        <p className="text-[14px] leading-snug text-ink-soft">
          <Lead ticket={ticket} mark={mark} />
          {current?.title ?? "Le run n'a encore rien poussé."}
        </p>

        {/* Le titre est borné à l'écriture ; quand il a été coupé, le texte
            entier vit dans le detail. On le montre plutôt que de laisser croire
            que la phrase s'arrête là. */}
        {current?.detail ? (
          <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-primary-faint">{current.detail}</p>
        ) : null}

        <Aside current={current} mark={mark} stepSince={stepSince} connection={connection} />
      </div>
    </header>
  );
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
  if (mark === "escalated") return <strong className="font-medium text-ko">Le run est arrêté — </strong>;
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
      {silent && current ? (
        <span className="flex items-baseline gap-1.5 text-drift">
          silencieux depuis
          <Elapsed since={current.ts} />
        </span>
      ) : null}
      {connection === "closed" ? (
        <span className="text-ko">
          Flux interrompu — la page ne suit plus le run. Le run, lui, continue.
        </span>
      ) : null}
    </p>
  );
}
