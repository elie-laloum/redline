import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Chevron } from "#/components/atoms";
import type { AskQuestion, PendingQuestion } from "#/lib/event";
import { cn } from "#/lib/utils";

/**
 * Le lot de questions.
 *
 * C'est le seul endroit de la page qui agisse sur le run, et le seul moment ou
 * le run est arrete sur quelqu'un. Il vit donc dans la colonne de travail, en
 * pleine largeur, jamais dans le bandeau : un en-tete d'etat sert a etre lu en
 * dix secondes, pas a porter six paragraphes et quatre champs.
 *
 * **Une question par vue.** Six questions empilees, c'est six decisions
 * ouvertes en meme temps et aucune tranchee ; une seule sous les yeux, c'est
 * une decision a la fois. Repondre avance tout seul, et on revient ou on veut :
 * les pastilles du haut sont a la fois l'avancement et la navigation.
 *
 * **L'envoi ne descend plus avec la lecture.** Il etait au pied du module,
 * donc sous une question longue il quittait l'ecran, et l'etat du lot — combien
 * de reponses manquent — partait avec lui. L'en-tete est colle sous le bandeau
 * et porte les trois choses qui ne doivent jamais disparaitre : ce qui bloque le
 * run, ou on en est, et le bouton. Le pied ne garde que la navigation.
 *
 * **La mesure est pour la prose et rien d'autre.** La question garde ses 68ch
 * parce qu'elle se lit ; les options, le champ et le registre prennent la
 * colonne entiere parce que ce sont des controles et des lignes, et que les
 * borner a une mesure de lecture laisse une colonne morte a droite.
 */

export interface QuestionModuleProps {
  readonly question: PendingQuestion;
  readonly onAnswer: (id: string, answers: Record<string, string>) => Promise<boolean>;
}

export function QuestionModule({ question, onAnswer }: QuestionModuleProps) {
  const { questions } = question;
  const [picked, setPicked] = useState<Record<string, string>>({});
  const [free, setFree] = useState<Record<string, string>>({});
  const [at, setAt] = useState(0);
  const [sending, setSending] = useState(false);
  const [failed, setFailed] = useState(false);
  const heading = useRef<HTMLParagraphElement>(null);
  const moved = useRef(false);

  // Le champ libre l'emporte des qu'il porte quelque chose : c'est le geste le
  // plus explicite des deux.
  const answers = useMemo(() => {
    const out: Record<string, string> = {};
    for (const entry of questions) {
      const written = free[entry.key]?.trim();
      const chosen = picked[entry.key];
      if (written) out[entry.key] = written;
      else if (chosen) out[entry.key] = chosen;
    }
    return out;
  }, [questions, picked, free]);

  const remaining = questions.filter((entry) => !answers[entry.key]).length;
  const complete = remaining === 0;
  // La vue apres la derniere question est le registre.
  const last = questions.length;
  const recap = at >= last;

  const go = useCallback(
    (to: number) => {
      moved.current = true;
      setAt(Math.max(0, Math.min(last, to)));
    },
    [last],
  );

  const submit = useCallback(async () => {
    if (!complete || sending) return;
    setSending(true);
    setFailed(false);
    try {
      const ok = await onAnswer(question.id, answers);
      if (!ok) setFailed(true);
    } finally {
      setSending(false);
    }
  }, [answers, complete, onAnswer, question.id, sending]);

  // Le focus suit la navigation, sinon un lecteur d'ecran reste sur un bouton
  // « suivant » pendant que la question a change derriere lui. Au premier rendu
  // il ne bouge pas : rien n'a encore ete navigue.
  // biome-ignore lint/correctness/useExhaustiveDependencies: `at` est le declencheur, pas une lecture
  useEffect(() => {
    if (moved.current) heading.current?.focus();
  }, [at]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.target instanceof HTMLInputElement && event.key !== "Enter") return;
      if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
        event.preventDefault();
        void submit();
        return;
      }
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (event.key === "ArrowRight") go(at + 1);
      if (event.key === "ArrowLeft") go(at - 1);
      if (event.key === "Enter" && event.target instanceof HTMLInputElement) go(at + 1);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [at, go, submit]);

  if (!question.answerable) return <Withdrawn question={question} />;

  const here = questions[at];

  return (
    <section aria-label="Questions en attente" className="question-ground border-y border-human/40">
      {/* Collé sous le bandeau, qui publie sa hauteur : elle change quand la
          phrase d'un agent passe à la ligne, donc on la lit au lieu de la
          recopier. Même sol que la section, résolu en opaque — un en-tête
          translucide laisserait défiler les options au travers de lui. */}
      <header className="question-ground sticky top-[var(--banner-h)] z-10 border-b border-human/25 px-6 pt-5 pb-3">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <h2 className="text-[15px] font-medium tracking-tight">
            {last > 1 ? `${last} questions arrêtent le run` : "Une question arrête le run"}
          </h2>
          {question.askedBy ? (
            <span className="text-[12px] text-ink-faint">
              <span className="text-ink-faint/70">agent - </span>
              {question.askedBy}
            </span>
          ) : null}

          <div className="ml-auto flex items-center gap-3">
            {/* Ce qui reste se lit à côté du bouton désactivé, pas à sa place :
                l'état du bouton est l'information, et la phrase dit pourquoi. */}
            <p className={cn("text-[12px]", failed ? "text-ko" : "text-ink-faint")}>
              {failed
                ? "Repris dans le terminal — réponds-y là-bas."
                : !complete && `${remaining} réponse${remaining > 1 ? "s" : ""} à donner`}
            </p>
            {complete && (
              <button
                type="button"
                onClick={submit}
                disabled={!complete || sending}
                className={cn(
                  "h-8 shrink-0 rounded-sm bg-primary  px-3 text-[13px] font-medium transition-opacity",
                  complete && !sending
                    ? "bg-ink text-bg hover:opacity-90"
                    : "cursor-not-allowed bg-field text-ink-faint",
                )}
              >
                {sending ? "Envoi…" : "Répondre et relancer"}
              </button>
            )}
          </div>
        </div>

        <Track questions={questions} answers={answers} at={at} onGo={go} />
      </header>

      <div className="px-6 pt-5 pb-5">
        {recap || !here ? (
          <Ledger questions={questions} answers={answers} onEdit={go} />
        ) : (
          <Question
            key={here.key}
            entry={here}
            rank={at + 1}
            total={last}
            headingRef={heading}
            chosen={picked[here.key] ?? null}
            written={free[here.key] ?? ""}
            onPick={(option) => {
              setPicked((current) => ({ ...current, [here.key]: option }));
              setFree((current) => ({ ...current, [here.key]: "" }));
              // Choisir avance : c'est le geste qui fait qu'un lot de six se
              // traverse sans jamais chercher où cliquer ensuite.
              //
              // Sauf quand il n'y a qu'une question. Avancer mène alors au
              // récapitulatif, qui ne sait pas préciser une réponse — et c'est
              // exactement là qu'on veut le faire, sur un « modifier : je dis
              // ce que je change ». Avec l'envoi permanent dans l'en-tête, on
              // validait sans avoir pu écrire. Une question seule reste donc
              // sous les yeux, avec son champ libre.
              if (last > 1) go(at + 1);
            }}
            onWrite={(value) => setFree((current) => ({ ...current, [here.key]: value }))}
          />
        )}

        <div className="mt-5 flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-human/25 pt-3">
          <Step direction="left" disabled={at === 0} onClick={() => go(at - 1)}>
            Précédent
          </Step>
          {recap ? null : (
            <Step direction="right" onClick={() => go(at + 1)}>
              {at === last - 1 ? "Relire" : "Suivant"}
            </Step>
          )}
          <kbd className="ml-auto hidden font-mono text-[11px] text-ink-faint sm:block">
            ← → pour naviguer, ⌘↵ pour envoyer
          </kbd>
        </div>
      </div>
    </section>
  );
}

/**
 * La barre du lot, sur une seule ligne.
 *
 * Elle portait six libelles en capitales sur deux rangees, ce qui se lit comme
 * un menu alors que c'est une jauge. Reste ce qu'elle avait a dire : une
 * pastille par question — repondue, courante, restante — et le libelle de la
 * seule qui est sous les yeux, ecrit en clair a cote. Les pastilles cliquent,
 * donc c'est toujours la navigation ; elles ne pesent simplement plus une
 * rangee chacune.
 */
function Track({
  questions,
  answers,
  at,
  onGo,
}: {
  questions: readonly AskQuestion[];
  answers: Record<string, string>;
  at: number;
  onGo: (to: number) => void;
}) {
  const here = questions[at];

  return (
    <nav aria-label="Questions du lot" className="flex items-center gap-3 pt-3">
      <ol className="flex shrink-0 items-center gap-1.5">
        {questions.map((entry, index) => {
          const done = Boolean(answers[entry.key]);
          const current = index === at;
          return (
            <li key={entry.key} className="flex">
              <button
                type="button"
                onClick={() => onGo(index)}
                aria-current={current ? "step" : undefined}
                title={entry.header}
                className="flex size-4 items-center justify-center rounded-sm"
              >
                <span className="sr-only">
                  {entry.header}
                  {done ? " (répondue)" : ""}
                </span>
                <span
                  aria-hidden
                  className={cn(
                    "size-2 rounded-full transition-colors",
                    current
                      ? "bg-ink ring-2 ring-ink/25"
                      : done
                        ? "bg-human"
                        : "bg-human/25 hover:bg-human/50",
                  )}
                />
              </button>
            </li>
          );
        })}
        <li className="flex">
          <button
            type="button"
            onClick={() => onGo(questions.length)}
            aria-current={at >= questions.length ? "step" : undefined}
            className={cn(
              "ml-1.5 text-[11px] font-medium uppercase tracking-wide transition-colors",
              at >= questions.length ? "text-ink" : "text-ink-faint hover:text-ink-soft",
            )}
          >
            Relire
          </button>
        </li>
      </ol>

      <span className="min-w-0 truncate text-[12px] text-ink-soft">
        {here ? here.header : "Le lot entier, avant de débloquer le run"}
      </span>
    </nav>
  );
}

function Question({
  entry,
  rank,
  total,
  headingRef,
  chosen,
  written,
  onPick,
  onWrite,
}: {
  entry: AskQuestion;
  rank: number;
  total: number;
  headingRef: React.RefObject<HTMLParagraphElement | null>;
  chosen: string | null;
  written: string;
  onPick: (option: string) => void;
  onWrite: (value: string) => void;
}) {
  return (
    <div className="flex flex-col gap-4">
      <p className="font-mono text-[11px] tabular-nums text-ink-faint" aria-live="polite">
        question {rank} sur {total}
      </p>

      {/* La question est la seule prose du module : elle garde la mesure
          lisible et n'est jamais coupée. */}
      <p
        ref={headingRef}
        tabIndex={-1}
        className="max-w-[68ch] whitespace-pre-wrap text-[16px] leading-relaxed outline-none"
      >
        {entry.question}
      </p>

      {entry.options.length > 0 ? (
        <ul className="flex flex-col border-y border-human/20">
          {entry.options.map((option) => {
            const selected = chosen === option && !written.trim();
            return (
              <li key={option} className="border-b border-human/15 last:border-b-0">
                <button
                  type="button"
                  onClick={() => onPick(option)}
                  aria-pressed={selected}
                  className={cn(
                    // L'anneau de focus global porte a 2px vers l'exterieur ;
                    // sur une ligne pleine largeur il mordrait sur les filets
                    // du dessus et du dessous. Il rentre a l'interieur.
                    "flex w-full items-start gap-3 px-2.5 py-2.5 text-left text-[14px] leading-relaxed transition-colors",
                    "focus-visible:-outline-offset-2",
                    selected ? "bg-human text-bg" : "text-ink-soft hover:bg-human/10 hover:text-ink",
                  )}
                >
                  <Marker selected={selected} />
                  <span className="min-w-0 flex-1">{option}</span>
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}

      <input
        value={written}
        onChange={(event) => onWrite(event.target.value)}
        placeholder={entry.options.length > 0 ? "Autre réponse" : "Ta réponse"}
        className="h-9 w-full rounded-sm border bg-field px-2.5 text-[13px] placeholder:text-ink-faint"
      />
    </div>
  );
}

/**
 * Le marqueur d'une option, dessine et pas emprunte.
 *
 * Un anneau au trait de la page, plein quand il est choisi. Sur une ligne
 * selectionnee il passe en encre-du-sol, parce que le sol est devenu `human` a
 * pleine force et qu'un anneau sombre y disparaitrait.
 */
function Marker({ selected }: { selected: boolean }) {
  return (
    <span
      aria-hidden
      className={cn(
        "mt-[3px] flex size-3.5 shrink-0 items-center justify-center rounded-full border",
        selected ? "border-bg" : "border-ink-faint/50",
      )}
    >
      {selected ? <span className="size-1.5 rounded-full bg-bg" /> : null}
    </span>
  );
}

/**
 * Le registre : le lot entier sur une ligne par question.
 *
 * C'etait une relecture en prose, une carte par question, qui se deroulait sur
 * un ecran. Comme l'envoi est desormais accessible en permanence dans l'en-tete,
 * la seule chose qui reste a faire ici est de **verifier avant de debloquer
 * trois heures de run** — ce qui se fait en balayant une colonne, pas en lisant
 * six paragraphes. La question passe donc en second rang, sous la reponse : on
 * vient controler ce qu'on a repondu, pas redecouvrir ce qu'on demandait.
 */
function Ledger({
  questions,
  answers,
  onEdit,
}: {
  questions: readonly AskQuestion[];
  answers: Record<string, string>;
  onEdit: (to: number) => void;
}) {
  return (
    <ol className="flex flex-col border-y border-human/20">
      {questions.map((entry, index) => {
        const given = answers[entry.key];
        return (
          <li
            key={entry.key}
            className="grid grid-cols-1 items-baseline gap-x-6 gap-y-1 border-b border-human/15 py-3 last:border-b-0 md:grid-cols-[minmax(0,13rem)_minmax(0,1fr)_auto]"
          >
            <span
              className={cn(
                "text-[11px] font-medium uppercase tracking-wide",
                given ? "text-ink-soft" : "text-drift",
              )}
            >
              {entry.header}
            </span>

            <div className="min-w-0">
              <p className={cn("text-[14px] leading-relaxed", given ? "text-ink" : "text-drift")}>
                {given ?? "Sans réponse — le lot ne part pas tant qu'elle manque."}
              </p>
              <p className="mt-0.5 line-clamp-2 text-[12px] leading-relaxed text-ink-faint">
                {entry.question}
              </p>
            </div>

            <button
              type="button"
              onClick={() => onEdit(index)}
              className="justify-self-start text-[12px] text-ink-faint underline underline-offset-2 hover:text-ink md:justify-self-end"
            >
              {given ? "modifier" : "répondre"}
            </button>
          </li>
        );
      })}
    </ol>
  );
}

/**
 * Le lot qu'on ne peut plus rendre ici.
 *
 * Il attend toujours, mais dans le terminal : `ask-user` s'y replie quand le
 * shell n'a pas repondu a temps, et un shell relance au milieu d'un lot
 * retrouve les questions sans retrouver la promesse qui tient le workflow. On
 * les montre quand meme — c'est ce qui bloque le run — en disant ou repondre,
 * dans le meme dessin que le module vivant : une variante qui garde l'ancien
 * ferait croire a un autre objet.
 */
function Withdrawn({ question }: { question: PendingQuestion }) {
  return (
    <section
      aria-label="Questions reprises dans le terminal"
      className="question-ground border-y border-human/40 px-6 py-5"
    >
      <header className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 className="text-[15px] font-medium tracking-tight">
          {question.questions.length > 1
            ? `${question.questions.length} questions arrêtent le run`
            : "Une question arrête le run"}
        </h2>
        {question.askedBy ? (
          <span className="text-[12px] text-ink-faint">
            <span className="text-ink-faint/70">agent - </span>
            {question.askedBy}
          </span>
        ) : null}
      </header>

      <p className="max-w-[68ch] pt-1.5 text-[13px] leading-relaxed text-ink-soft">
        Elles ont été reprises dans le terminal, et c'est là qu'il faut y répondre — la page ne tient plus le
        fil qui débloque le run.
      </p>

      <ol className="mt-4 flex flex-col border-y border-human/20">
        {question.questions.map((entry) => (
          <li
            key={entry.key}
            className="grid grid-cols-1 gap-x-6 gap-y-1 border-b border-human/15 py-3 last:border-b-0 md:grid-cols-[minmax(0,13rem)_minmax(0,1fr)]"
          >
            <span className="text-[11px] font-medium uppercase tracking-wide text-ink-faint">
              {entry.header}
            </span>
            <div className="min-w-0">
              <p className="whitespace-pre-wrap text-[14px] leading-relaxed">{entry.question}</p>
              {entry.options.length > 0 ? (
                <p className="mt-1.5 text-[12px] leading-relaxed text-ink-faint">
                  {entry.options.join("  ·  ")}
                </p>
              ) : null}
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

function Step({
  direction,
  disabled,
  onClick,
  children,
}: {
  direction: "left" | "right";
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "flex h-8 items-center gap-1.5 rounded-sm px-2 text-[13px] transition-colors",
        disabled ? "cursor-not-allowed text-ink-faint/60" : "text-ink-soft hover:bg-field hover:text-ink",
      )}
    >
      {direction === "left" ? <Chevron direction="left" /> : null}
      {children}
      {direction === "right" ? <Chevron direction="right" /> : null}
    </button>
  );
}
