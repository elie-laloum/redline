import { useCallback, useState } from "react";
import { At, Caret, StateDot } from "#/components/atoms";
import type { PendingPlan, PlanRepo, PlanVerdict } from "#/lib/event";
import type { ChecklistLine, PlanRepoEntry, Ticket } from "#/lib/ticket";
import { cn } from "#/lib/utils";

/**
 * Le gate du point 9.
 *
 * C'est le seul arret prevu du workflow : tout ce qui suit s'execute sans
 * nouvelle validation, publication comprise. Ca merite donc une page, pas un
 * formulaire — il passait par `ask-user`, cinq questions dont on avait oublie la
 * premiere en repondant a la derniere, pour valider un objet qui se lit d'un
 * seul tenant.
 *
 * **Il porte le contrat de sortie avec le plan.** Les deux checklists avaient
 * leur propre widget, en lecture, a cote d'une revue qui montrait la meme
 * matiere en train de bouger : deux vues d'un contrat qu'on n'approuvait ni
 * dans l'une ni dans l'autre. Elles sont ici, parce que c'est ici qu'on dit
 * oui — on n'approuve pas un plan sans ce sur quoi il sera juge. Apres le gate,
 * seule la revue les suit, vivantes.
 *
 * Le perimetre, lui, n'y est pas : il a son widget, et il ne se decide pas au
 * point 9 mais au point 5.
 *
 * Il est rendu dans le meme bloc que ce qui arrete le run, au-dessus de
 * l'etabli, pour la meme raison qu'un lot de questions : on ne doit jamais
 * pouvoir lire tranquillement pendant que le run attend.
 */

export interface PlanGateProps {
  readonly ticket: Ticket;
  readonly plan: PendingPlan | null;
  readonly onDecide: (id: string, verdict: PlanVerdict, note: string) => Promise<boolean>;
}

/** Ce que chaque sortie demande d'ecrire avant de partir. */
const VERDICTS: Record<PlanVerdict, { label: string; asks: string | null }> = {
  approve: { label: "Approuver", asks: null },
  amend: { label: "Amender", asks: "Ce qu'il faut changer dans le plan" },
  reject: { label: "Rejeter", asks: "Pourquoi — fonctionnel renvoie au point 4, technique au point 7" },
};

export function PlanGate({ ticket, plan, onDecide }: PlanGateProps) {
  // Approuve : le plan a fait son travail, il se range en une ligne. Il reste
  // relisible, parce que c'est le contrat qu'on verifie pendant les trois
  // heures d'implementation qui suivent.
  if (!plan) {
    return ticket.planApprovedAt ? (
      <Settled at={ticket.planApprovedAt} repos={ticket.planRepos} tests={ticket.tests} code={ticket.code} />
    ) : null;
  }
  return <Gate ticket={ticket} plan={plan} onDecide={onDecide} />;
}

function Gate({
  ticket,
  plan,
  onDecide,
}: {
  ticket: Ticket;
  plan: PendingPlan;
  onDecide: PlanGateProps["onDecide"];
}) {
  const [verdict, setVerdict] = useState<PlanVerdict>("approve");
  const [note, setNote] = useState("");
  const [sending, setSending] = useState(false);
  const [failed, setFailed] = useState(false);

  const asks = VERDICTS[verdict].asks;
  const ready = asks === null || note.trim().length > 0;

  const submit = useCallback(async () => {
    if (!ready || sending) return;
    setSending(true);
    setFailed(false);
    try {
      if (!(await onDecide(plan.id, verdict, note))) setFailed(true);
    } finally {
      setSending(false);
    }
  }, [note, onDecide, plan.id, ready, sending, verdict]);

  if (!plan.answerable) return <Withdrawn plan={plan} />;

  return (
    <section aria-label="Plan à approuver" className="question-ground border-y border-human/40">
      <header className="question-ground sticky top-[var(--banner-h)] z-10 border-b border-human/25 px-6 pt-5 pb-3">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <h2 className="text-[15px] font-medium tracking-tight">Le plan attend ton approbation</h2>
          {plan.askedBy ? (
            <span className="text-[12px] text-ink-faint">
              <span className="text-ink-faint/70">agent - </span>
              {plan.askedBy}
            </span>
          ) : null}
          <span className="font-mono text-[12px] tabular-nums text-ink-faint">
            {plan.repos.length} dépôt{plan.repos.length > 1 ? "s" : ""}
          </span>

          <div className="ml-auto flex items-center gap-3">
            <p className={cn("text-[12px]", failed ? "text-ko" : "text-ink-faint")}>
              {failed
                ? "Repris dans le terminal — réponds-y là-bas."
                : verdict === "approve"
                  ? "Tout ce qui suit s'exécute sans nouvelle validation."
                  : ready
                    ? "Le planner reprendra là-dessus."
                    : "Dis ce qui cloche, sinon il repart sur la même hypothèse."}
            </p>
            <button
              type="button"
              onClick={submit}
              disabled={!ready || sending}
              className={cn(
                "h-8 shrink-0 rounded-sm px-3 text-[13px] font-medium transition-opacity",
                ready && !sending
                  ? "bg-ink text-bg hover:opacity-90"
                  : "cursor-not-allowed bg-field text-ink-faint",
              )}
            >
              {sending ? "Envoi…" : VERDICTS[verdict].label}
            </button>
          </div>
        </div>

        {/* Les trois sorties, toutes visibles : lire un plan en sachant qu'on
            peut le renvoyer n'est pas le lire en sachant qu'on doit dire oui. */}
        <div className="flex flex-wrap items-center gap-1 pt-3">
          {(Object.keys(VERDICTS) as PlanVerdict[]).map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => setVerdict(option)}
              aria-pressed={verdict === option}
              className={cn(
                "rounded-sm px-2.5 py-1 text-[13px] transition-colors",
                verdict === option ? "bg-human text-bg" : "text-ink-soft hover:bg-human/10 hover:text-ink",
              )}
            >
              {VERDICTS[option].label}
            </button>
          ))}
        </div>
      </header>

      <div className="flex flex-col gap-5 px-6 pt-5 pb-5">
        {plan.note ? <p className="text-[14px] leading-relaxed text-ink-soft">{plan.note}</p> : null}

        <Order repos={plan.repos} />

        <Contract tests={ticket.tests} code={ticket.code} />

        {asks ? (
          <label className="flex flex-col gap-1.5">
            <span className="text-[11px] font-medium uppercase tracking-wide text-ink-faint">{asks}</span>
            <textarea
              value={note}
              onChange={(event) => setNote(event.target.value)}
              rows={3}
              className="w-full rounded-sm border bg-field px-2.5 py-2 text-[13px] leading-relaxed placeholder:text-ink-faint"
              placeholder="Une phrase suffit, tant qu'elle est précise."
            />
          </label>
        ) : null}

        <p className="text-[12px] leading-relaxed text-ink-faint">
          Le périmètre se lit dans son widget, plus bas. Ce qui s'approuve ici, c'est ce que chaque dépôt
          change, l'ordre dans lequel ils passent, et ce sur quoi le run sera jugé.
        </p>
      </div>
    </section>
  );
}

/**
 * Le plan, depot par depot, dans l'ordre d'execution.
 *
 * L'ordre est numerote et c'est l'exception a la regle du rail : ici la
 * sequence **est** l'information. Un depot aval traite avant son amont casse le
 * run, et c'est precisement ce qu'on relit avant de dire oui.
 */
function Order({ repos }: { repos: readonly (PlanRepo | PlanRepoEntry)[] }) {
  return (
    <ol className="flex flex-col border-y border-human/20">
      {repos.map((entry, index) => (
        <li key={entry.repo} className="flex gap-4 border-b border-human/15 py-3 last:border-b-0">
          <span className="w-6 shrink-0 pt-0.5 text-right font-mono text-[12px] tabular-nums text-ink-faint">
            {index + 1}
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <span className="font-mono text-[14px] font-medium">{entry.repo}</span>
              {entry.level !== null ? (
                <span className="text-[12px] text-ink-faint">niveau {entry.level}</span>
              ) : null}
            </div>
            {entry.why ? (
              <p className="pt-0.5 text-[13px] leading-relaxed text-ink-faint">{entry.why}</p>
            ) : null}
            {entry.changes.length > 0 ? (
              <ul className="flex flex-col pt-1.5">
                {entry.changes.map((change) => (
                  <li key={change} className="flex items-baseline gap-2 text-[14px] leading-relaxed">
                    <StateDot status="todo" className="translate-y-[-1px]" />
                    <span className="min-w-0 flex-1 text-ink-soft">{change}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="pt-1 text-[13px] text-drift">
                Rien de prévu pour ce dépôt — à vérifier avant d'approuver.
              </p>
            )}
          </div>
        </li>
      ))}
    </ol>
  );
}

/**
 * Le contrat de sortie, soumis avec le plan.
 *
 * Ce sont les lignes sur lesquelles les deux adversaires rendront leur verdict :
 * dire oui au plan, c'est dire oui a celles-la. Elles sont en texte et pas en
 * carres — a ce moment-la aucune n'a d'etat, et une grille de cinquante carres
 * vides ne demande rien a personne. La grille viendra apres, dans la revue,
 * quand elle aura quelque chose a montrer.
 */
function Contract({ tests, code }: { tests: readonly ChecklistLine[]; code: readonly ChecklistLine[] }) {
  if (tests.length + code.length === 0) {
    return (
      <p className="text-[13px] leading-relaxed text-drift">
        Aucune checklist de sortie — rien ne dira si le run a tenu sa promesse. À vérifier avant d'approuver.
      </p>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-x-10 gap-y-5 md:grid-cols-2">
      <Lines label="Tests" lines={tests} />
      <Lines label="Code" lines={code} />
    </div>
  );
}

function Lines({ label, lines }: { label: string; lines: readonly ChecklistLine[] }) {
  if (lines.length === 0) return null;
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <h3 className="flex items-baseline gap-2 text-[11px] font-medium uppercase tracking-wide text-ink-faint">
        {label}
        <span className="font-mono tabular-nums">{lines.length}</span>
      </h3>
      <ol className="flex flex-col">
        {lines.map((line) => (
          <li key={line.id} className="flex items-baseline gap-2 py-0.5 text-[13px] leading-relaxed">
            <span className="w-7 shrink-0 font-mono text-[11px] text-ink-faint">{line.id}</span>
            <span className="min-w-0 flex-1 text-ink-soft">{line.criterion}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

/**
 * Le plan approuve, replie.
 *
 * Une ligne, parce que le gate est passe. Depliable, parce que c'est le contrat
 * qu'on relit pendant les trois heures qui suivent pour verifier que le run fait
 * ce qu'on a valide — et depliable **sur le plan lui-meme**, pas sur une phrase
 * qui renvoie au flux d'events. Renvoyer ailleurs ce qu'on a sous la main, c'est
 * exactement le recoupement que cette page existe pour supprimer.
 */
function Settled({
  at,
  repos,
  tests,
  code,
}: {
  at: string;
  repos: readonly PlanRepoEntry[];
  tests: readonly ChecklistLine[];
  code: readonly ChecklistLine[];
}) {
  const [open, setOpen] = useState(false);

  return (
    <section aria-label="Plan approuvé" className="border-b px-6 py-2.5">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 rounded-sm text-left text-[13px] text-ink-soft hover:text-ink"
      >
        <Caret open={open} />
        <span className="flex items-baseline gap-2">
          Plan approuvé
          <At iso={at} className="text-[12px] text-ink-faint" />
        </span>
        <span className="ml-auto font-mono text-[12px] tabular-nums text-ink-faint">
          {repos.length} dépôt{repos.length > 1 ? "s" : ""}
        </span>
      </button>

      {open ? (
        <div className="flex flex-col gap-5 pt-4 pb-2">
          {repos.length > 0 ? (
            <Order repos={repos} />
          ) : (
            <p className="text-[13px] leading-relaxed text-drift">
              Le plan a été approuvé, mais l'état du ticket n'en garde pas le détail — le planner ne l'a pas
              écrit dans `plan.repos`. Il se relit dans le flux du run, en bas.
            </p>
          )}
          <Contract tests={tests} code={code} />
        </div>
      ) : null}
    </section>
  );
}

/** Le gate repris au terminal : on montre ce qui bloque, on ne fait pas semblant. */
function Withdrawn({ plan }: { plan: PendingPlan }) {
  return (
    <section
      aria-label="Plan repris dans le terminal"
      className="question-ground border-y border-human/40 px-6 py-5"
    >
      <h2 className="text-[15px] font-medium tracking-tight">Le plan attend ton approbation</h2>
      <p className="pt-1.5 text-[13px] leading-relaxed text-ink-soft">
        Il a été repris dans le terminal, et c'est là qu'il faut trancher — la page ne tient plus le fil qui
        débloque le run.
      </p>
      <div className="pt-4">
        <Order repos={plan.repos} />
      </div>
    </section>
  );
}
