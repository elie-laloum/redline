import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { At, Elapsed, Nothing } from "#/components/atoms";
import { Docket } from "#/components/docket";
import { QuestionPanel } from "#/components/question-panel";
import { Rail } from "#/components/rail";
import { StateStrip } from "#/components/state-strip";
import type { LiveEvent } from "#/lib/event";
import { getSnapshot } from "#/lib/snapshot-fn";
import type { DocketSection, Escalation } from "#/lib/ticket";
import { type Connection, useLiveRun } from "#/lib/use-live-run";
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
          selected={section}
          onSelect={setSection}
        />
      </aside>

      <main className="flex min-w-0 flex-1 flex-col">
        <Now current={run.current} connection={run.connection} />
        <StateStrip ticket={run.ticket} loops={run.loops} stepSince={run.stepSince} />

        {run.ticket.run.escalation ? <EscalationNotice escalation={run.ticket.run.escalation} /> : null}
        {run.question ? <QuestionPanel question={run.question} onAnswer={run.answer} /> : null}

        <div className="flex-1 px-6 py-6">
          <Docket ticket={run.ticket} section={section} onClearSection={() => setSection(null)} />
        </div>

        <Stream events={run.events} ignored={run.ignored} />
      </main>
    </div>
  );
}

/**
 * Ce qui se passe maintenant, en une ligne.
 *
 * Le loader vit dans le rail, sur l'etape ; ici on ne repete pas la motion, on
 * dit seulement ce que cette etape est en train de faire.
 */
function Now({ current, connection }: { current: LiveEvent | null; connection: Connection }) {
  return (
    <header className="sticky top-0 z-20 flex items-center gap-3 border-b bg-bg/90 px-6 py-3 backdrop-blur">
      <p className="min-w-0 flex-1 truncate text-[14px]" title={current?.title ?? undefined}>
        {current?.title ?? "En attente du premier event du run"}
      </p>
      {current?.agent || current?.tool ? (
        <span className="hidden shrink-0 font-mono text-[12px] text-ink-faint md:inline">
          {[current.agent, current.tool].filter(Boolean).join(" · ")}
        </span>
      ) : null}
      {current ? <Elapsed since={current.ts} className="shrink-0 text-[12px] text-ink-faint" /> : null}
      {connection === "closed" ? <span className="shrink-0 text-[12px] text-ko">flux interrompu</span> : null}
    </header>
  );
}

/** Une escalade bloque visuellement : on comprend pourquoi sans cliquer. */
function EscalationNotice({ escalation }: { escalation: Escalation }) {
  return (
    <section className="border-y border-ko/40 bg-ko/[0.06] px-6 py-4">
      <div className="flex flex-wrap items-baseline gap-2">
        <h2 className="text-[15px] font-medium text-ko">Le run est arrete</h2>
        <span className="font-mono text-[12px] text-ink-faint">point {escalation.step}</span>
        {escalation.repo ? <span className="font-mono text-[12px] text-ink-faint">{escalation.repo}</span> : null}
        {escalation.at ? <At iso={escalation.at} className="ml-auto text-[11px] text-ink-faint" /> : null}
      </div>
      <p className="mt-1.5 max-w-[68ch] text-[14px] leading-relaxed text-ink-soft">{escalation.reason}</p>
      <p className="mt-2 max-w-[68ch] text-[13px] leading-relaxed text-ink-faint">
        Rien n'a ete publie : ni merge request, ni canal, ni transition Jira. Les commits et les tags
        deja poses restent en place. Relancer le run reprend exactement ici.
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
        <span className={cn("text-ink-faint transition-transform", open && "rotate-90")}>›</span>
        Flux complet du run
        <span className="font-mono text-[12px] tabular-nums text-ink-faint">{events.length}</span>
        {ignored.length > 0 ? (
          <span className="ml-auto font-mono text-[12px] text-waiting">{ignored.length} ignores</span>
        ) : null}
      </button>

      {open ? (
        <div className="px-6 pb-6">
          {events.length === 0 ? (
            <Nothing>Aucun event recu pour l'instant.</Nothing>
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
              <h3 className="text-[12px] font-medium uppercase tracking-wide text-ink-faint">Events ignores</h3>
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
