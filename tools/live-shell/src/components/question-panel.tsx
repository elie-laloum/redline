import { useMemo, useState } from "react";
import { Badge, Button, Card, CardBody, CardHeader } from "#/components/ui";
import type { PendingQuestion } from "#/lib/event";
import { cn } from "#/lib/utils";

/**
 * Le lot de questions.
 *
 * Il prend le focus : le workflow est arrete tant qu'il est la. On repond a
 * tout d'un coup — poser trois questions l'une apres l'autre, c'est trois
 * arrets la ou un seul suffit.
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
    <Card className="border-waiting/50 bg-waiting/5">
      <CardHeader
        title={
          question.questions.length > 1
            ? `${question.questions.length} questions en attente`
            : "Question en attente"
        }
        aside={
          <>
            {question.askedBy ? <Badge tone="waiting">{question.askedBy}</Badge> : null}
            <span className="tabular-nums">
              {question.questions.length - remaining.length}/{question.questions.length}
            </span>
          </>
        }
      />

      <CardBody className="flex flex-col gap-5">
        {question.questions.map((entry, index) => {
          const answered = Boolean(answers[entry.key]);
          return (
            <fieldset key={entry.key} className="flex flex-col gap-2 border-0 p-0">
              <legend className="mb-1 flex items-center gap-2">
                <Badge tone={answered ? "ok" : "neutral"}>{entry.header}</Badge>
                {question.questions.length > 1 ? (
                  <span className="text-[11px] text-muted-foreground">
                    {index + 1}/{question.questions.length}
                  </span>
                ) : null}
              </legend>

              <p className="whitespace-pre-wrap text-sm">{entry.question}</p>

              {entry.options.length > 0 ? (
                <div className="flex flex-wrap gap-1.5">
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
                          "rounded-md border px-2.5 py-1 text-left text-sm transition-colors",
                          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                          selected
                            ? "border-transparent bg-primary text-primary-foreground"
                            : "hover:bg-accent hover:text-accent-foreground",
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
                className={cn(
                  "h-8 rounded-md border bg-background px-3 text-sm",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                )}
              />
            </fieldset>
          );
        })}

        <div className="flex items-center justify-between gap-3 border-t pt-3">
          <p className="text-xs text-muted-foreground">
            {complete
              ? "Le run repart des que tu valides."
              : `Il reste ${remaining.length} question${remaining.length > 1 ? "s" : ""} sans réponse.`}
          </p>
          <div className={cn(!complete && "cursor-not-allowed opacity-40")}>
            <Button onClick={submit}>{sending ? "Envoi…" : "Répondre"}</Button>
          </div>
        </div>
      </CardBody>
    </Card>
  );
}
