import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Banner } from "#/components/banner";
import { Dock } from "#/components/dock";
import { Rail } from "#/components/rail";
import { StateStrip } from "#/components/state-strip";
import type { Focus } from "#/components/widgets";
import { Blocking, Workbench } from "#/components/workbench";
import { useNotify } from "#/lib/notify";
import { getSnapshot } from "#/lib/snapshot-fn";
import { useLiveRun } from "#/lib/use-live-run";

export const Route = createFileRoute("/")({
  // Rendu serveur de l'etat complet : la premiere frame montre deja le run.
  loader: () => getSnapshot(),
  component: LiveShell,
});

/**
 * Deux registres, et ils ne se melangent plus.
 *
 * A gauche, ce qui est **decide et stable** : les treize etapes, les agents, et
 * le dossier en sections depliables. A droite, l'etabli — le lot de questions
 * qui attend, le chantier du depot, la revue, les checklists, les arbitrages.
 *
 * **Le rail ne commande plus rien.** Il a longtemps bascule la colonne : cliquer
 * une entree du dossier remplacait l'etabli par un document, donc le chantier et
 * la revue quittaient l'ecran pendant qu'on lisait une decision. Il a ensuite
 * fait defiler jusqu'au widget. Il ne fait plus que montrer ou en est le run —
 * tout ce qui se lit se lit dans l'etabli, d'un seul defilement.
 */
function LiveShell() {
  const run = useLiveRun(Route.useLoaderData());
  const [focus, setFocus] = useState<Focus | null>(null);
  // Le seul moment ou cette page a le droit de reclamer l'attention hors de son
  // onglet : quand le run s'est arrete sur toi.
  const notify = useNotify(run.ticket, run.question, run.plan);

  const blocked = Boolean(run.question || run.plan || run.ticket.run.escalation);

  return (
    <div className="flex min-h-screen pb-11">
      <aside className="sticky top-0 hidden h-[calc(100vh-2.75rem)] w-[19rem] shrink-0 border-r bg-rail text-rail-ink lg:block">
        <Rail ticket={run.ticket} step={run.step} steps={run.steps} agents={run.agents} />
      </aside>

      <main className="flex min-w-0 flex-1 flex-col">
        <Banner
          ticket={run.ticket}
          step={run.step}
          current={run.working}
          question={run.question}
          mark={run.mark}
          stepSince={run.stepSince}
          connection={run.connection}
        />
        <StateStrip ticket={run.ticket} loops={run.loops} />

        <Blocking
          ticket={run.ticket}
          question={run.question}
          plan={run.plan}
          onAnswer={run.answer}
          onDecide={run.decide}
        />

        <Workbench
          ticket={run.ticket}
          step={run.step}
          blocked={blocked}
          worksites={run.worksites}
          focus={focus}
          onFocus={setFocus}
        />
      </main>

      <Dock
        ticket={run.ticket}
        events={run.events}
        ignored={run.ignored}
        notify={notify.state}
        onNotify={notify.ask}
      />
    </div>
  );
}
