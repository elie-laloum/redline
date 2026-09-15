import { useMemo, useState } from "react";
import type { PendingQuestion } from "#/lib/event";
import { cn } from "#/lib/utils";

/**
 * Le lot de questions.
 *
 * Il prend le dessus du pli : le workflow est arrete tant qu'il est la. On
 * repond a tout d'un coup — poser trois questions l'une apres l'autre, c'est
 * trois arrets la ou un seul suffit.
 *
 * Chaque question propose des options **et** un champ libre. Les options
 * tranchent d'un clic ; le champ libre existe parce qu'un agent qui propose
 * quatre reponses peut passer a cote de la bonne, et qu'on ne veut pas forcer
 * un choix entre quatre reponses fausses.
 */

export interface QuestionPanelProps {
  readonly question: PendingQuestion;
  readonly onAnswer: (id: string, answers: Record<string, string>) => Promise<void>;
}

export function QuestionPanel({ question, onAnswer }: QuestionPanelProps) {
  const [picked, setPicked] = useState<Record<string, string>>({});
  const [free, setFree] = useState<Record<string, string>>({});
  const [sending, setSending] = useState(false);

  // Le champ libre l'emporte des qu'il porte quelque chose : c'est le geste le
  // plus explicite des deux.
  const answers = useMemo(() => {
    const out: Record<string, string> = {};
    for (const entry of question.questions) {
      const written = free[entry.key]?.trim();
      const chosen = picked[entry.key];
      if (written) out[entry.key] = written;
      else if (chosen) out[entry.key] = chosen;
    }
    return out;
  }, [question.questions, picked, free]);

  const remaining = question.questions.filter((entry) => !answers[entry.key]);
  const complete = remaining.length === 0;

  async function submit() {
    if (!complete || sending) return;
    setSending(true);
    try {
      await onAnswer(question.id, answers);
    } finally {
      setSending(false);
    }
  }

  return (
    <section
      aria-label="Questions en attente"
      className="border-y border-human/40 bg-human/[0.06] px-6 py-5"
    >
      <header className="flex items-baseline gap-2 pb-4">
        <h2 className="text-[15px] font-medium tracking-tight">
          {question.questions.length > 1
            ? `${question.questions.length} questions arretent le run`
            : "Une question arrete le run"}
        </h2>
        {question.askedBy ? <span className="text-[12px] text-ink-faint">{question.askedBy}</span> : null}
        <span className="ml-auto font-mono text-[12px] tabular-nums text-ink-faint">
          {question.questions.length - remaining.length}/{question.questions.length}
        </span>
      </header>

      <div className="flex flex-col gap-6">
        {question.questions.map((entry) => {
          const answered = Boolean(answers[entry.key]);
          return (
            <fieldset key={entry.key} className="flex flex-col gap-2 border-0 p-0">
              <legend className="flex items-baseline gap-2 pb-1">
                <span
                  className={cn(
                    "text-[12px] font-medium uppercase tracking-wide",
                    answered ? "text-ok" : "text-ink-faint",
                  )}
                >
                  {entry.header}
                </span>
              </legend>

              <p className="max-w-[68ch] whitespace-pre-wrap text-[14px] leading-relaxed">{entry.question}</p>

              {entry.options.length > 0 ? (
                <div className="flex flex-wrap gap-1.5 pt-0.5">
                  {entry.options.map((option) => {
                    const selected = picked[entry.key] === option && !free[entry.key]?.trim();
                    return (
                      <button
                        key={option}
                        type="button"
                        onClick={() => {
                          setPicked((current) => ({ ...current, [entry.key]: option }));
                          setFree((current) => ({ ...current, [entry.key]: "" }));
                        }}
                        className={cn(
                          "rounded-sm border px-2.5 py-1 text-left text-[13px] transition-colors",
                          selected
                            ? "border-ink bg-ink text-bg"
                            : "border-line bg-field hover:border-ink-faint hover:text-ink",
                        )}
                      >
                        {option}
                      </button>
                    );
                  })}
                </div>
              ) : null}

              <input
                value={free[entry.key] ?? ""}
                onChange={(event) => setFree((current) => ({ ...current, [entry.key]: event.target.value }))}
                placeholder={entry.options.length > 0 ? "Autre réponse" : "Ta réponse"}
                className="h-8 max-w-[68ch] rounded-sm border bg-field px-2.5 text-[13px] placeholder:text-ink-faint"
              />
            </fieldset>
          );
        })}
      </div>

      <div className="mt-5 flex items-center gap-3 border-t border-line-soft pt-3">
        <button
          type="button"
          onClick={submit}
          disabled={!complete || sending}
          className={cn(
            "h-8 rounded-sm px-3 text-[13px] font-medium transition-colors",
            complete && !sending
              ? "bg-ink text-bg hover:opacity-90"
              : "cursor-not-allowed bg-field text-ink-faint",
          )}
        >
          {sending ? "Envoi…" : "Répondre et relancer le run"}
        </button>
        <p className="text-[12px] text-ink-faint">
          {complete
            ? "Le run repart dès que tu valides."
            : `Il reste ${remaining.length} réponse${remaining.length > 1 ? "s" : ""} à donner.`}
        </p>
      </div>
    </section>
  );
}
