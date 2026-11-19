import { INSIGHT_LABELS, INSIGHT_QUESTIONS, type Insight, type InsightRequest, TASK_QUESTIONS } from "../../domain/insight.ts";
import type { ExplainLine } from "./explain.ts";

/** The explanation view's panel of questions to the run explainer; null while it shows the plain reading. */
export type InsightPanel =
  | { readonly mode: "menu"; readonly cursor: number; readonly hint: string | null }
  | { readonly mode: "asking"; readonly request: InsightRequest }
  | { readonly mode: "answer"; readonly request: InsightRequest; readonly insight: Insight; readonly cursor: number; readonly open: readonly number[] }
  | { readonly mode: "failed"; readonly request: InsightRequest; readonly text: string };

export type InsightKey = "up" | "down" | "left" | "right" | "return" | "escape" | "r";

export const INSIGHT_KEYS: ReadonlySet<string> = new Set<InsightKey>(["up", "down", "left", "right", "return", "escape", "r"]);

export const MENU: InsightPanel = { mode: "menu", cursor: 0, hint: null };

export interface InsightMove {
  readonly panel: InsightPanel | null;
  /** The question to put to the explainer, when the key asks one; `fresh` when an answer already on hand must not be reused. */
  readonly ask: { readonly request: InsightRequest; readonly fresh: boolean } | null;
}

const stay = (panel: InsightPanel | null): InsightMove => ({ panel, ask: null });
/** Back to the menu, on the question just asked. */
const menuOn = (request: InsightRequest): InsightPanel => ({ mode: "menu", cursor: Math.max(0, INSIGHT_QUESTIONS.indexOf(request.question)), hint: null });
const clamp = (value: number, length: number) => Math.max(0, Math.min(length - 1, value));

/** What a key does to the panel. Nothing leaves without Enter or r: an agent is called only then. */
export function pressInsight(panel: InsightPanel, key: InsightKey, task: string | null): InsightMove {
  switch (panel.mode) {
    case "menu": {
      if (key === "escape") return stay(null);
      if (key === "up" || key === "down") return stay({ ...panel, cursor: clamp(panel.cursor + (key === "up" ? -1 : 1), INSIGHT_QUESTIONS.length), hint: null });
      if (key !== "return") return stay(panel);
      const question = INSIGHT_QUESTIONS[panel.cursor] ?? "stop";
      if (TASK_QUESTIONS.has(question) && task === null) return stay({ ...panel, hint: "Choisis d'abord une tache dans la liste." });
      return { panel: { mode: "asking", request: { question, task: TASK_QUESTIONS.has(question) ? task : null } }, ask: { request: { question, task: TASK_QUESTIONS.has(question) ? task : null }, fresh: false } };
    }
    case "asking":
      return stay(key === "escape" ? menuOn(panel.request) : panel);
    case "failed":
      if (key === "escape") return stay(menuOn(panel.request));
      if (key === "r") return { panel: { mode: "asking", request: panel.request }, ask: { request: panel.request, fresh: true } };
      return stay(panel);
    case "answer": {
      const count = panel.insight.findings.length;
      if (key === "escape") return stay(menuOn(panel.request));
      if (key === "r") return { panel: { mode: "asking", request: panel.request }, ask: { request: panel.request, fresh: true } };
      if (key === "up" || key === "down") return stay({ ...panel, cursor: clamp(panel.cursor + (key === "up" ? -1 : 1), count) });
      if (key === "right" || key === "return") return stay(panel.open.includes(panel.cursor) ? panel : { ...panel, open: [...panel.open, panel.cursor] });
      if (key === "left") return stay({ ...panel, open: panel.open.filter((index) => index !== panel.cursor) });
      return stay(panel);
    }
  }
}

const title = (text: string): ExplainLine => ({ text, tone: "title" });
const line = (text: string, tone: ExplainLine["tone"] = "text"): ExplainLine => ({ text, tone });
const blank = (): ExplainLine => ({ text: "", tone: "muted" });

function asked(request: InsightRequest, label: (task: string) => string): string {
  return `${INSIGHT_LABELS[request.question]}${request.task ? ` — ${label(request.task)}` : ""}`;
}

/** The panel as lines of the explanation view; `task` is the task selected on the dashboard. */
export function insightLines(panel: InsightPanel, task: string | null, label: (task: string) => string): ExplainLine[] {
  switch (panel.mode) {
    case "menu":
      return [
        title("Demander a l'IA"),
        line("Une question coute un appel a un agent, qui lit le journal du run. Rien ne part sans Entree.", "muted"),
        blank(),
        ...INSIGHT_QUESTIONS.map((question, index) => {
          const needsTask = TASK_QUESTIONS.has(question);
          const about = needsTask ? (task ? ` — ${label(task)}` : " (choisis une tache)") : "";
          return line(`${index === panel.cursor ? "›" : " "} ${INSIGHT_LABELS[question]}${about}`, index === panel.cursor ? "title" : needsTask && !task ? "muted" : "text");
        }),
        ...(panel.hint ? [blank(), line(panel.hint, "warning")] : []),
        blank(),
        line("↑↓ choisir · Entree demander · Esc revenir a l'explication", "muted"),
      ];
    case "asking":
      return [title(asked(panel.request, label)), blank(), line("L'agent lit le journal du run…", "muted"), blank(), line("Esc revenir au menu : la reponse sera ignoree.", "muted")];
    case "failed":
      return [title(asked(panel.request, label)), blank(), line(panel.text, "danger"), blank(), line("r reessayer · Esc revenir au menu", "muted")];
    case "answer":
      return [
        title(asked(panel.request, label)),
        blank(),
        ...panel.insight.findings.flatMap((finding, index) => {
          const open = panel.open.includes(index);
          const head = line(`${index === panel.cursor ? "›" : " "} ${open ? "▾" : "▸"} ${finding.headline}`, index === panel.cursor ? "title" : "text");
          return open ? [head, line(`    ${finding.detail}`, "muted")] : [head];
        }),
        blank(),
        title("Ensuite"),
        line(panel.insight.conclusion, "success"),
        blank(),
        line("↑↓ constats · → deplier · ← replier · r reposer la question · Esc menu", "muted"),
      ];
  }
}
