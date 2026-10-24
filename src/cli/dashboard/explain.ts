import { formatDuration } from "./format.ts";
import { type Dashboard, exhausted, gatesOf, lanesOf, phaseLabel, spentOf, type TaskRow } from "./model.ts";

export interface ExplainLine {
  readonly text: string;
  readonly tone: "title" | "text" | "muted" | "warning" | "danger" | "success";
}

const title = (text: string): ExplainLine => ({ text, tone: "title" });
const line = (text: string, tone: ExplainLine["tone"] = "text"): ExplainLine => ({ text, tone });
const blank = (): ExplainLine => ({ text: "", tone: "muted" });

const GATES: Readonly<Record<string, string>> = {
  zone: "l'auteur des tests n'a touche que des fichiers de test",
  adversaire: "un relecteur cherche les tests qui passeraient pour de mauvaises raisons",
  rouge: "les nouveaux tests echouent bien avant que le code soit ecrit",
  recours: "les desaccords du developpeur avec un test sont tranches",
  "tests-modifies": "la suite tient toujours la checklist apres un test modifie",
  vert: "les tests passent une fois le code ecrit",
};

function counts(tasks: readonly TaskRow[]): { done: number; failed: number; active: number; total: number } {
  return {
    done: tasks.filter((row) => row.status === "done").length,
    failed: tasks.filter((row) => row.status === "failed").length,
    active: tasks.filter((row) => row.status === "active").length,
    total: tasks.length,
  };
}

/**
 * Reads the run's state back in plain words: where it is, what is working, what each judge of the
 * loop is for, and what the numbers already say. Derived from the dashboard alone — no agent is
 * asked anything, so opening this panel costs nothing and says nothing the screen does not hold.
 */
export function explain(state: Dashboard): ExplainLine[] {
  const out: ExplainLine[] = [];
  const { done, failed, active, total } = counts(state.tasks);

  out.push(title("Ou en est le run"));
  out.push(
    line(
      state.phase
        ? `Phase ${phaseLabel(state.phase)} — ${done}/${total} taches finies${failed ? `, ${failed} en echec` : ""}.`
        : "Le run n'a pas encore annonce de phase.",
    ),
  );
  out.push(line(`Depuis ${formatDuration(state.now - state.startedAt)}, ${active} tache(s) en cours.`, "muted"));

  if (state.waiting) {
    out.push(blank(), title("Une question t'attend"));
    out.push(line(state.asked?.question ?? "La tache attend une reponse.", "warning"));
    out.push(line("Tab amene au panneau de reponse.", "muted"));
  }

  const current = state.tasks.find((row) => row.key === state.active) ?? state.tasks.find((row) => row.status === "active");
  if (current) {
    out.push(blank(), title("Ce qui travaille maintenant"));
    out.push(line(current.label));
    const lanes = lanesOf(state, current.key);
    for (const lane of lanes) {
      const last = lane.tools.at(-1);
      out.push(line(`${lane.role}${lane.lane ? ` · ${lane.lane}` : ""}${last ? ` — ${last}` : ""}`, "muted"));
    }
    if (lanes.length === 0) out.push(line("Aucun agent n'a encore parle sur cette tache.", "muted"));
  }

  const loop = state.loop ?? current?.key ?? null;
  const gates = loop ? gatesOf(state, loop) : [];
  if (gates.length) {
    out.push(blank(), title("Les juges de cette boucle"));
    for (const gate of gates) {
      const meaning = GATES[gate.gate];
      const verdict = gate.verdict === "pass" ? "accepte" : "renvoie le travail";
      const tone = exhausted(gate) ? "danger" : gate.verdict === "pass" ? "success" : "warning";
      out.push(line(`${gate.gate} — ${verdict} (tour ${gate.round}, ${spentOf(gate)})`, tone));
      if (meaning) out.push(line(`  verifie que ${meaning}.`, "muted"));
    }
  }

  const stuck = gates.filter((gate) => exhausted(gate));
  const tight = gates.filter((gate) => !exhausted(gate) && gate.verdict === "feedback" && gate.budget !== null && gate.spent >= gate.budget - 1);
  const broken = state.tasks.filter((row) => row.status === "failed" && row.error);
  if (stuck.length || tight.length || broken.length) {
    out.push(blank(), title("Ce que ca veut dire"));
    for (const gate of stuck) out.push(line(`${gate.gate} a epuise son budget : le run va rendre la main plutot que de tourner.`, "danger"));
    for (const gate of tight) out.push(line(`${gate.gate} en est a ${spentOf(gate)} : il reste un tour avant l'escalade.`, "warning"));
    for (const row of broken) out.push(line(`${row.label} — ${row.error}`, "danger"));
  }

  out.push(blank(), title("Si le run s'arrete"));
  out.push(line("convergence — les agents n'ont pas converge dans le budget. Lis le dernier retour, puis reprends avec --fresh.", "muted"));
  out.push(line("arbitrage — une decision te revient. Tranche-la dans les arbitrages du ticket, puis reprends.", "muted"));
  out.push(line("environment — la machine a bloque (commande, conteneur, reseau). Repare, puis reprends sans --fresh.", "muted"));

  return out;
}
