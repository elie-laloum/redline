import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { At, Nothing } from "#/components/atoms";
import { Banner } from "#/components/banner";
import { Docket } from "#/components/docket";
import { QuestionPanel } from "#/components/question-panel";
import { Rail } from "#/components/rail";
import { StateStrip } from "#/components/state-strip";
import type { LiveEvent } from "#/lib/event";
import { getSnapshot } from "#/lib/snapshot-fn";
import { DOCKET_LABELS, type DocketSection, type Escalation, type Ticket } from "#/lib/ticket";
import { useLiveRun } from "#/lib/use-live-run";
import { cn } from "#/lib/utils";

export const Route = createFileRoute("/")({
  // Rendu serveur de l'etat complet : la premiere frame montre deja le run.
  loader: () => getSnapshot(),
  component: LiveShell,
});

function LiveShell() {
  const run = useLiveRun(Route.useLoaderData());
  const [section, setSection] = useState<DocketSection | null>(null);

  return (
    <div className="flex min-h-screen">
      <aside className="sticky top-0 hidden h-screen w-[19rem] shrink-0 border-r bg-rail text-rail-ink lg:block">
        <Rail
          ticket={run.ticket}
          loops={run.loops}
          stepSince={run.stepSince}
          mark={run.mark}
          selected={section}
          onSelect={setSection}
        />
      </aside>

      <main className="flex min-w-0 flex-1 flex-col">
        <Banner
          ticket={run.ticket}
          current={run.current}
          mark={run.mark}
          stepSince={run.stepSince}
          connection={run.connection}
        />
        <StateStrip ticket={run.ticket} loops={run.loops} />

        {run.ticket.run.escalation ? <EscalationNotice escalation={run.ticket.run.escalation} /> : null}
        {run.question ? <QuestionPanel question={run.question} onAnswer={run.answer} /> : null}

        <div className="flex flex-1 gap-8 px-6 py-6">
          <Docket ticket={run.ticket} section={section} onClearSection={() => setSection(null)} />
          <DocketIndex ticket={run.ticket} onSelect={setSection} />
        </div>

        <Stream events={run.events} ignored={run.ignored} />
      </main>
    </div>
  );
}

/**
 * Le sommaire du dossier, dans le tiers de droite.
 *
 * La colonne de texte est bornee a la mesure lisible ; ce qui reste a droite
 * n'est pas un trou, c'est la marge d'un document — et une marge de document
 * porte son index. Apres seize decisions techniques, on a perdu de vue dans
 * quelle section on lit.
 */
function DocketIndex({ ticket, onSelect }: { ticket: Ticket; onSelect: (section: DocketSection) => void }) {
  const sections: { id: DocketSection; count: number }[] = [
    { id: "functional", count: ticket.functional.length },
    { id: "technical", count: ticket.technical.length },
    { id: "scope", count: ticket.scope.length },
    { id: "checklists", count: ticket.tests.length + ticket.code.length },
    { id: "contradictions", count: ticket.contradictions.length },
  ];

  return (
    <aside className="sticky top-16 hidden h-fit w-56 shrink-0 flex-col gap-1.5 xl:flex">
      <h2 className="text-[11px] font-medium uppercase tracking-wide text-ink-faint">Dans ce dossier</h2>
      <ul className="flex flex-col">
        {sections.map((entry) => (
          <li key={entry.id}>
            <a
              href={`#docket-${entry.id}`}
              onClick={() => onSelect(entry.id)}
              className="flex items-baseline gap-2 py-1 text-[12px] text-ink-soft hover:text-ink"
            >
              <span className="min-w-0 flex-1 truncate">{DOCKET_LABELS[entry.id]}</span>
              <span className="shrink-0 font-mono tabular-nums text-ink-faint">{entry.count}</span>
            </a>
          </li>
        ))}
      </ul>
    </aside>
  );
}

/** Une escalade bloque visuellement : on comprend pourquoi sans cliquer. */
function EscalationNotice({ escalation }: { escalation: Escalation }) {
  return (
    <section className="border-y border-ko/40 bg-ko/[0.06] px-6 py-4">
      <div className="flex flex-wrap items-baseline gap-2">
        <h2 className="text-[15px] font-medium text-ko">Le run est arrêté</h2>
        <span className="text-[12px] text-ink-faint">à l'étape {escalation.step}</span>
        {escalation.repo ? <span className="font-mono text-[12px] text-ink-faint">{escalation.repo}</span> : null}
        {escalation.at ? <At iso={escalation.at} className="ml-auto text-[11px] text-ink-faint" /> : null}
      </div>
      <p className="mt-1.5 max-w-[68ch] text-[14px] leading-relaxed text-ink-soft">{escalation.reason}</p>
      <p className="mt-2 max-w-[68ch] text-[13px] leading-relaxed text-ink-faint">
        Rien n'a été publié : ni merge request, ni canal Slack, ni changement de statut Jira. Les
        commits et les tags déjà posés restent en place. Relancer le run reprend exactement ici.
      </p>
    </section>
  );
}

/**
 * Le flux brut, replie.
 *
 * Il est en bas et ferme par defaut : c'est la matiere de secours quand le
 * dossier ne suffit pas, pas la lecture principale.
 */
function Stream({
  events,
  ignored,
}: {
  events: readonly LiveEvent[];
  ignored: readonly { at: string; reason: string }[];
}) {
  const [open, setOpen] = useState(false);

  return (
    <section className="border-t">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center gap-2 px-6 py-3 text-left text-[13px] text-ink-soft hover:bg-field"
        aria-expanded={open}
      >
        <Chevron open={open} />
        Tous les événements du run
        <span className="font-mono text-[12px] tabular-nums text-ink-faint">{events.length}</span>
        {ignored.length > 0 ? (
          <span className="ml-auto font-mono text-[12px] text-drift">{ignored.length} illisibles</span>
        ) : null}
      </button>

      {open ? (
        <div className="px-6 pb-6">
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
              <h3 className="text-[12px] font-medium uppercase tracking-wide text-ink-faint">Événements illisibles, ignorés</h3>
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
      ) : null}
    </section>
  );
}

/** Le seul signe dessine de la page : un chevron, ferme a droite, ouvert en bas. */
function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      viewBox="0 0 12 12"
      aria-hidden
      className={cn("size-3 shrink-0 text-ink-faint transition-transform", open && "rotate-90")}
    >
      <path
        d="M4.5 2.5 8 6l-3.5 3.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
