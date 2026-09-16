import { useCallback, useEffect, useRef, useState } from "react";
import type { PendingPlan, PendingQuestion } from "./event.ts";
import type { Ticket } from "./ticket.ts";

/**
 * La notification du navigateur, et les deux seuls moments qui la justifient.
 *
 * Cette page ne pilote pas le run, mais elle sait une chose que personne
 * d'autre ne sait : **le run s'est arrete sur toi**. Un lot de questions pose a
 * 13h dans un onglet qu'on a quitte reste invisible jusqu'a ce qu'on y revienne,
 * et entre-temps rien n'avance. C'est le seul cas ou une page a le droit de
 * reclamer l'attention hors de son onglet.
 *
 * Donc deux evenements, et pas un de plus : un lot de questions qui arrive, et
 * une escalade. Pas un agent qui demarre, pas une etape qui passe, pas un
 * commit — ce sont des choses qu'on vient lire, pas des choses qui t'attendent.
 *
 * **Jamais quand l'onglet est visible.** Notifier quelqu'un de ce qu'il a deja
 * sous les yeux est le plus court chemin pour qu'il coupe les notifications.
 */

export type NotifyState = "unsupported" | "default" | "granted" | "denied";

function current(): NotifyState {
  if (typeof window === "undefined" || !("Notification" in window)) return "unsupported";
  return Notification.permission as NotifyState;
}

export function useNotify(ticket: Ticket, question: PendingQuestion | null, plan: PendingPlan | null) {
  // Le rendu serveur n'a pas de `Notification` : on part de `unsupported` des
  // deux cotes et on corrige apres le montage, sinon l'hydratation diverge.
  const [state, setState] = useState<NotifyState>("unsupported");
  const seen = useRef<{ question: string | null; plan: string | null; escalation: string | null }>({
    question: null,
    plan: null,
    escalation: null,
  });

  useEffect(() => setState(current()), []);

  const ask = useCallback(async () => {
    if (current() === "unsupported") return;
    try {
      setState((await Notification.requestPermission()) as NotifyState);
    } catch {
      setState(current());
    }
  }, []);

  const escalation = ticket.run.escalation;

  useEffect(() => {
    if (state !== "granted") return;

    // Le premier passage apprend ce qui attendait deja, sans rien annoncer : un
    // onglet rouvert sur un lot vieux de trois heures ne doit pas sonner comme
    // s'il venait d'arriver.
    const first =
      seen.current.question === null && seen.current.plan === null && seen.current.escalation === null;
    const marks = {
      question: question?.id ?? null,
      plan: plan?.id ?? null,
      escalation: escalation?.at ?? null,
    };

    const fresh =
      !first &&
      ((marks.question !== null && marks.question !== seen.current.question) ||
        (marks.plan !== null && marks.plan !== seen.current.plan) ||
        (marks.escalation !== null && marks.escalation !== seen.current.escalation));

    const previous = seen.current;
    seen.current = marks;
    if (!fresh || !document.hidden) return;

    const stopped = marks.escalation !== null && marks.escalation !== previous.escalation;
    const key = ticket.key ?? "Le run";
    const gate = marks.plan !== null && marks.plan !== previous.plan;
    const body = stopped
      ? (escalation?.reason ?? "Le run est arrêté et attend que tu reprennes la main.")
      : gate
        ? "Le plan est prêt. Tout ce qui suit s'exécute sans nouvelle validation."
        : question && question.questions.length > 1
          ? `${question.questions.length} questions à trancher. Rien n'avance avant.`
          : "Une question à trancher. Rien n'avance avant.";

    try {
      const note = new Notification(stopped ? `${key} — le run est arrêté` : `${key} — le run t'attend`, {
        body,
        // Le tag fait que deux lots successifs remplacent la meme notification
        // au lieu d'en empiler deux : il n'y a qu'un run, il n'attend qu'une
        // fois.
        tag: `autopilot-${ticket.key ?? "run"}`,
        requireInteraction: stopped,
      });
      note.onclick = () => {
        window.focus();
        note.close();
      };
    } catch {
      // Le navigateur a refuse de l'afficher. Ce n'est pas au shell d'insister.
    }
  }, [state, question, plan, escalation, ticket.key]);

  return { state, ask };
}
