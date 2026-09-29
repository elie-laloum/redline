import type { Ledger } from "../../src/app/ledger.ts";
import { defineFraming } from "../../src/phases/framing/workflow.ts";
import { answering, type Answerer, type World } from "./world.ts";

export const ISSUE = {
  key: "FT-1",
  summary: "Filtrer la liste par periode",
  description: "La liste des feuilles doit se filtrer par periode.\n\nCriteres d'acceptation :\n- La periode par defaut est le mois en cours\n",
};

export const question = { id: "defaut", header: "Periode par defaut", text: "Quelle periode a l'ouverture ?", options: ["Mois en cours", "Dernier mois clos"] };
export const functionalAsk = { done: false, questions: [question], arbitrages: [], contradictions: [] };
export const functionalDone = { done: true, questions: [], arbitrages: [{ question: "Periode par defaut ?", answer: "Mois en cours", why: "choix de l'humain" }], contradictions: [] };
export const technicalDone = (answer = "On etend clamp") => ({ done: true, questions: [], arbitrages: [{ question: "Ou vit le filtre ?", answer, why: "src/period.js porte deja la periode" }], contradictions: [] });

export const scoutCore = (prompt: string) =>
  prompt.includes("fixture-core (level 1")
    ? { impacted: true, area: "periode", evidence: ["src/period.js:1 — clamp porte la periode"], reason: "la periode vit ici", contradictions: [] }
    : { impacted: false, area: "", evidence: [], reason: "rien a changer ici", contradictions: [] };

export const plan = (overrides: Record<string, unknown> = {}) => ({
  summary: "On etend clamp dans fixture-core.",
  repos: [
    {
      repo: "fixture-core",
      type: "feature",
      changes: ["clamp rend le mois en cours quand la periode est absente."],
      why: "La periode vit ici.",
      tests: [{ id: "T1", criterion: "Sans periode, clamp rend le mois en cours.", kind: "ut", covers: ["AC1"] }],
      code: [{ id: "C1", criterion: "Les appelants de clamp ne changent pas." }],
      ...overrides,
    },
  ],
  openPoints: [],
});

export async function frame(world: World, ledger: Ledger, answers: readonly (string | Answerer)[]) {
  const framing = defineFraming(world.run(ledger));
  const storage = world.storage(ledger.key);
  const checkpoint = { store: storage.checkpoints, runId: `${ledger.key}/framing/${ledger.framing.attempt}`, version: "test" };
  const { result, asked } = await answering((given) => framing.workflow.start({ checkpoint, ...(given ? { answers: given } : {}) }), answers);
  return { result, asked, outcome: result.status === "done" ? framing.outcome(result) : null };
}
