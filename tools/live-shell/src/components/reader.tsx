import { useEffect, useRef } from "react";
import { Chevron, Mark, type MarkTone } from "#/components/atoms";
import { cn } from "#/lib/utils";

/**
 * Les deux facons de lire une liste dans l'etabli.
 *
 * Elles se repartissent sur une seule question : **est-ce que l'item porte un
 * etat ?**
 *
 * - Une ligne de checklist en porte un — rendue ou pas. La completion est alors
 *   ce qu'on vient chercher, et vingt-huit carres se comptent d'un coup d'oeil
 *   la ou vingt-huit lignes se deroulent. La grille est la vue d'ensemble, le
 *   carrousel porte le detail.
 * - Un arbitrage n'en porte aucun : c'est du texte, il se lit ou pas. Il n'y a
 *   rien a voir d'un coup d'oeil, donc le carrousel **est** la vue d'ensemble.
 *
 * Sous deux items, ni l'un ni l'autre : un carrousel d'un seul item est une
 * mecanique qui ne sert a rien, et deux pastilles de navigation valent moins
 * que les deux items poses l'un sous l'autre.
 */

/** En dessous, on montre tout : la navigation couterait plus que le deroule. */
export const CAROUSEL_FROM = 2;

export interface CarouselProps {
  readonly label: string;
  readonly count: number;
  readonly at: number;
  readonly onGo: (to: number) => void;
  /** L'etat de chaque item, quand il en a un : la pastille le reprend. */
  readonly tone?: (index: number) => string | null;
  readonly children: React.ReactNode;
}

/**
 * Un item a la fois, avec de quoi passer au suivant sans revenir en arriere.
 *
 * L'en-tete porte la position et les deux fleches ; les pastilles sont sous le
 * contenu, parce qu'elles sont une jauge avant d'etre une navigation. Le corps
 * a une hauteur minimale : sans elle, passer d'un arbitrage de trois lignes au
 * suivant qui en fait une fait sauter tout ce qui est en dessous.
 */
export function Carousel({ label, count, at, onGo, tone, children }: CarouselProps) {
  const body = useRef<HTMLElement>(null);
  const moved = useRef(false);

  // biome-ignore lint/correctness/useExhaustiveDependencies: `at` est le declencheur, pas une lecture
  useEffect(() => {
    if (moved.current) body.current?.focus();
  }, [at]);

  const go = (to: number) => {
    moved.current = true;
    onGo(Math.max(0, Math.min(count - 1, to)));
  };

  // Le clavier est porte par les fleches et les pastilles — de vrais boutons —
  // et pas par une enveloppe : les fleches ne doivent agir que quand ce
  // carrousel-ci a la main. Six widgets qui ecouteraient la fenetre se
  // disputeraient la meme touche, et le module de questions l'utilise deja.
  const keys = (event: React.KeyboardEvent) => {
    if (event.key === "ArrowRight") go(at + 1);
    else if (event.key === "ArrowLeft") go(at - 1);
    else if (event.key === "Home") go(0);
    else if (event.key === "End") go(count - 1);
    else return;
    event.preventDefault();
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <span className="font-mono text-[11px] tabular-nums text-ink-faint">
          {at + 1} sur {count}
        </span>
        <div className="ml-auto flex items-center gap-0.5">
          <Arrow
            direction="left"
            label={`${label} précédent`}
            disabled={at === 0}
            onClick={() => go(at - 1)}
            onKeys={keys}
          />
          <Arrow
            direction="right"
            label={`${label} suivant`}
            disabled={at >= count - 1}
            onClick={() => go(at + 1)}
            onKeys={keys}
          />
        </div>
      </div>

      {/* Le corps est une region nommee, et il prend le focus au clavier.
          
          Deux raisons : apres un changement d'item, le focus vient ici pour
          qu'un lecteur d'ecran lise le nouveau contenu au lieu de rester sur une
          fleche qui n'a pas bouge — et une fois qu'on est dedans, les fleches
          naviguent. Le clavier ne vit jamais sur la fenetre : six carrousels qui
          l'ecouteraient se disputeraient la meme touche, et le module de
          questions l'utilise deja. */}
      <section
        ref={body}
        // biome-ignore lint/a11y/noNoninteractiveTabindex: le motif ARIA du carrousel veut un corps focusable — c'est lui qui recoit le focus apres un changement d'item, et c'est de la que les fleches naviguent
        tabIndex={0}
        aria-label={label}
        aria-roledescription="carrousel"
        className="min-h-24 rounded-sm outline-none focus-visible:outline-2 focus-visible:outline-ink"
        onKeyDown={keys}
      >
        {children}
      </section>

      <Dots label={label} count={count} at={at} onGo={go} tone={tone} onKeys={keys} />
    </div>
  );
}

function Arrow({
  direction,
  label,
  disabled,
  onClick,
  onKeys,
}: {
  direction: "left" | "right";
  label: string;
  disabled: boolean;
  onClick: () => void;
  onKeys: (event: React.KeyboardEvent) => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      onKeyDown={onKeys}
      disabled={disabled}
      aria-label={label}
      className={cn(
        "flex size-6 items-center justify-center rounded-sm transition-colors",
        disabled ? "cursor-not-allowed text-ink-faint/40" : "text-ink-faint hover:bg-field hover:text-ink",
      )}
    >
      <Chevron direction={direction} />
    </button>
  );
}

/**
 * La jauge du carrousel.
 *
 * Elle prend la couleur de l'etat quand l'item en a un : sur une checklist, les
 * pastilles disent donc deja ou en est la liste, et la grille au-dessus n'est
 * que la meme chose en plus grand. Sans etat, elles restent de l'encre — c'est
 * une position, pas un verdict.
 */
function Dots({
  label,
  count,
  at,
  onGo,
  tone,
  onKeys,
}: {
  label: string;
  count: number;
  at: number;
  onGo: (to: number) => void;
  tone?: (index: number) => string | null;
  onKeys: (event: React.KeyboardEvent) => void;
}) {
  return (
    <ol aria-label={label} className="flex flex-wrap items-center gap-1">
      {Array.from({ length: count }, (_, index) => {
        const here = index === at;
        const hue = tone?.(index) ?? null;
        return (
          // biome-ignore lint/suspicious/noArrayIndexKey: la position EST l'identite ici
          <li key={index} className="flex">
            <button
              type="button"
              onClick={() => onGo(index)}
              onKeyDown={onKeys}
              aria-current={here ? "true" : undefined}
              className="flex size-4 items-center justify-center rounded-sm"
            >
              <span className="sr-only">
                {label} {index + 1}
              </span>
              <span
                aria-hidden
                className={cn(
                  "size-1.5 rounded-full transition-colors",
                  here ? "bg-ink ring-2 ring-ink/20" : (hue ?? "bg-line"),
                  !here && !hue && "hover:bg-ink-faint",
                )}
              />
            </button>
          </li>
        );
      })}
    </ol>
  );
}

export interface Cell {
  readonly id: string;
  /** Le meme vocabulaire que la todo du developer : c'est le meme carre. */
  readonly tone: MarkTone;
}

/**
 * La grille de carres.
 *
 * Elle ne dit qu'une chose et elle la dit sans qu'on compte : combien sur
 * combien. Un carre est rempli quand la ligne est rendue, creux quand elle ne
 * l'est pas, rouge quand elle bloque. Vingt-huit lignes de texte demandent de
 * lire vingt-huit fois pour apprendre la meme chose.
 *
 * Elle est faite de carres et pas de ronds : le rond est deja l'alphabet des
 * etats dans le rail et le bandeau, et une liste de vingt-huit ronds se lirait
 * comme vingt-huit agents.
 */
export function Grid({
  label,
  cells,
  at,
  onPick,
}: {
  label: string;
  cells: readonly Cell[];
  at: number | null;
  onPick: (index: number) => void;
}) {
  return (
    <ol aria-label={label} className="flex flex-wrap gap-1">
      {cells.map((cell, index) => (
        <li key={cell.id} className="flex">
          <button
            type="button"
            onClick={() => onPick(index)}
            aria-current={index === at ? "true" : undefined}
            title={cell.id}
            className={cn(
              "flex rounded-[2px]",
              // Le carre ouvert se distingue par un anneau d'encre, pas par une
              // teinte : sa teinte dit son etat, et elle ne se negocie pas.
              index === at && "ring-2 ring-ink/40 ring-offset-1 ring-offset-bg",
            )}
          >
            <Mark tone={cell.tone} interactive />
            <span className="sr-only">{cell.id}</span>
          </button>
        </li>
      ))}
    </ol>
  );
}
