import { useEffect, useState } from "react";
import { At, Caret, DocumentGlyph, Nothing } from "#/components/atoms";
import type { LiveEvent } from "#/lib/event";
import type { NotifyState } from "#/lib/notify";
import type { Ticket } from "#/lib/ticket";
import { cn } from "#/lib/utils";

/**
 * Le flux brut, dans un tiroir.
 *
 * Il etait en bas de la colonne de droite, replie, sous l'etabli : pour le
 * lire, il fallait scroller la page entiere jusqu'a lui, l'ouvrir, et perdre de
 * vue le bandeau qui dit ou on en est. C'est exactement la matiere qu'on
 * consulte **en gardant l'oeil sur le reste** — quand une etape traine et qu'on
 * veut savoir ce qui s'est dit depuis.
 *
 * Il est donc devenu un tiroir : une barre fixe toujours la, qui s'ouvre sur
 * les trois quarts de la hauteur et se referme sans avoir bouge la page. Le
 * reste du temps elle occupe onze unites, et c'est tout ce que la page lui
 * reserve — le tiroir ouvert recouvre, il ne pousse rien.
 *
 * C'est de la consultation, pas du pilotage : rien ici n'agit sur le run.
 */

const CLOSED = "h-11";
const OPEN = "h-[75vh]";

export interface DockProps {
  readonly ticket: Ticket;
  readonly events: readonly LiveEvent[];
  readonly ignored: readonly { at: string; reason: string }[];
  readonly notify: NotifyState;
  readonly onNotify: () => void;
}

export function Dock({ ticket, events, ignored, notify, onNotify }: DockProps) {
  const [open, setOpen] = useState(false);

  // Echap ferme, comme tout ce qui recouvre. Un tiroir a 75% de l'ecran qu'on
  // ne peut refermer qu'en visant un bouton de 28 pixels est un tiroir qu'on
  // n'ouvre pas deux fois.
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <section
      aria-label="Tous les événements du run"
      className={cn(
        "fixed inset-x-0 bottom-0 z-30 flex flex-col border-t bg-rail/95 backdrop-blur",
        "transition-[height] duration-300 ease-out motion-reduce:transition-none",
        open ? OPEN : CLOSED,
      )}
    >
      {/* Toute la barre ouvre le rapport, pas seulement la poignée.

          Un bouton de vingt-huit pixels au bout d'une barre pleine largeur est
          une cible qu'on rate, et il n'y avait aucune raison que les compteurs,
          eux, ne fassent rien. La cible couvre donc la barre entière, sous les
          visuels. Le seul contrôle qui garde son propre clic est la cloche,
          parce qu'elle fait autre chose. */}
      <header className="relative flex h-11 shrink-0 items-center gap-x-5 px-6">
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
          className="absolute inset-0 hover:bg-field/50"
        >
          <span className="sr-only">{open ? "Replier le rapport du run" : "Dérouler le rapport du run"}</span>
        </button>

        {/* Les compteurs du run, là où ils se lisent sans geste. Ils vivaient
            dans un repli au pied du rail, sous deux autres blocs : personne ne
            descendait les chercher. */}
        <div className="pointer-events-none relative flex items-center gap-x-5">
          <Count label="événements" value={events.length} />
          <Count label="interventions" value={ticket.metrics.humanInterventions} />
          <Count label="tours de boucle" value={ticket.metrics.loopTurnsTotal} />
          {ignored.length > 0 ? <Count label="illisibles" value={ignored.length} tone="text-drift" /> : null}
        </div>

        {/* Il ne s'affiche que tant qu'il y a quelque chose à demander : une
            fois accordé, il disparaît au lieu de rester témoin d'un réglage que
            personne ne rechangera. */}
        {notify === "default" ? (
          <button
            type="button"
            onClick={onNotify}
            className="relative ml-auto flex shrink-0 items-center gap-1.5 rounded-sm px-2 py-1 text-[12px] text-ink-faint hover:bg-field hover:text-ink"
          >
            <BellGlyph />
            Me prévenir quand le run m'attend
          </button>
        ) : null}

        <span
          aria-hidden
          className={cn(
            "pointer-events-none relative flex items-center gap-1.5 p-1.5 text-ink-faint",
            notify === "default" ? "" : "ml-auto",
          )}
        >
          {/* Fermé il pointe en haut, ouvert vers le bas : il montre où va le
              tiroir, pas où il en est. */}
          <Caret open={open} closed={-90} opened={90} />
          <DocumentGlyph />
        </span>
      </header>

      {/* Monte seulement ouvert : trois cents lignes d'events rendues en
          permanence sous une barre de onze unites, c'est trois cents lignes que
          personne ne regarde. */}
      {open ? <Log events={events} ignored={ignored} /> : null}
    </section>
  );
}

/**
 * Un compteur : le nombre d'abord, son nom apres.
 *
 * Le nombre est ce qu'on lit, il passe donc devant, en encre pleine et tabulaire.
 * Un compteur que le run n'a pas encore renseigne ne s'affiche pas : un `—` a
 * cote d'un libelle demande de decider s'il vaut zero ou rien.
 */
function Count({ label, value, tone }: { label: string; value: number | null; tone?: string }) {
  if (value === null) return null;
  return (
    <span className="flex shrink-0 items-baseline gap-1.5 text-[12px]">
      <span className={cn("font-mono tabular-nums", tone ?? "text-ink")}>{value}</span>
      <span className={cn(tone ?? "text-ink-faint")}>{label}</span>
    </span>
  );
}

/**
 * La cloche, dessinee au trait de la page, comme le caret et le document.
 */
function BellGlyph() {
  return (
    // biome-ignore lint/a11y/noSvgWithoutTitle: aria-hidden, et le bouton qui le porte se nomme
    <svg viewBox="0 0 16 16" aria-hidden focusable="false" className="size-3.5 shrink-0">
      <path
        d="M4 6.75a4 4 0 0 1 8 0c0 2.4.6 3.6 1.25 4.25h-10.5C3.4 10.35 4 9.15 4 6.75Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinejoin="round"
      />
      <path
        d="M6.75 13.25a1.4 1.4 0 0 0 2.5 0"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
      />
    </svg>
  );
}

function Log({ events, ignored }: Pick<DockProps, "events" | "ignored">) {
  return (
    <div className="min-h-0 flex-1 overflow-y-auto border-t border-line-soft px-6 py-4">
      {events.length === 0 ? (
        <Nothing>Aucun événement reçu pour l'instant.</Nothing>
      ) : (
        <ol className="flex flex-col">
          {[...events].reverse().map((event) => (
            <li
              key={`${event.runId}-${event.seq}`}
              className="flex items-baseline gap-3 border-b border-line-soft py-1.5 text-[12px] last:border-b-0"
            >
              <At iso={event.ts} className="shrink-0 text-ink-faint" />
              <span className="w-14 shrink-0 font-mono text-ink-faint">{event.kind}</span>
              <span className="min-w-0 flex-1">
                {event.title}
                {event.detail ? (
                  <span className="mt-0.5 block whitespace-pre-wrap text-ink-faint">{event.detail}</span>
                ) : null}
              </span>
              {event.agent ? <span className="shrink-0 text-ink-faint">{event.agent}</span> : null}
            </li>
          ))}
        </ol>
      )}

      {ignored.length > 0 ? (
        <div className="mt-4 border-t pt-3">
          <h3 className="text-[12px] font-medium uppercase tracking-wide text-ink-faint">
            Événements illisibles, ignorés
          </h3>
          <ul className="mt-1.5 flex flex-col gap-1 text-[12px] text-ink-faint">
            {ignored.map((entry) => (
              <li key={`${entry.at}-${entry.reason}`}>
                <At iso={entry.at} /> — {entry.reason}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
