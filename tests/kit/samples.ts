import type { PlanRepo } from "../../src/domain/plan.ts";
import type { TicketSnapshot } from "../../src/domain/ticket.ts";

export const TICKET: TicketSnapshot = {
  key: "FT-1025",
  squad: "FT",
  title: "Ajouter le filtre par periode",
  description: "Filtrer les feuilles par periode.",
  criteria: [{ id: "AC1", text: "Le filtre renvoie les feuilles du mois en cours" }],
  issueType: "Story",
  status: "READY TO DEV",
  url: "https://jira.test/browse/FT-1025",
  labels: [],
  links: [],
};

export const PLAN_REPO: PlanRepo = {
  repo: "fixture-core",
  type: "feature",
  changes: ["La periode accepte une borne haute."],
  why: "Amont de l'application.",
  tests: [{ id: "T1", criterion: "Le filtre renvoie le mois en cours.", kind: "ut", covers: ["AC1"] }],
  code: [{ id: "C1", criterion: "Les appelants compilent sans changement." }],
};
