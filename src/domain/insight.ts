import type { RunEvent } from "./run-events.ts";

export const INSIGHT_QUESTIONS = ["stop", "failures", "verdicts", "task"] as const;
export type InsightQuestion = (typeof INSIGHT_QUESTIONS)[number];

export const INSIGHT_LABELS: Readonly<Record<InsightQuestion, string>> = {
  stop: "Pourquoi le run s'est arrete",
  failures: "Resume les echecs successifs",
  verdicts: "Explique les verdicts de cette tache",
  task: "Explique cette tache",
};

/** The questions about one task need a task selected on the dashboard. */
export const TASK_QUESTIONS: ReadonlySet<InsightQuestion> = new Set(["verdicts", "task"]);

export interface InsightRequest {
  readonly question: InsightQuestion;
  /** The task selected on the dashboard; null when none is. */
  readonly task: string | null;
}

export interface Finding {
  /** One line, read in the list. */
  readonly headline: string;
  /** The paragraph unfolded under it. */
  readonly detail: string;
}

export interface Insight {
  readonly findings: readonly Finding[];
  /** What the human does next. */
  readonly conclusion: string;
}

/** What the journal holds of a run, as the explainer reads it: events, and how sessions ended. */
export type InsightLine = { readonly at: number; readonly event: RunEvent } | { readonly at: number; readonly outcome: unknown } | { readonly at: number };

/** Enough of the run to explain it, small enough for one cheap call: the most recent part is kept. */
const BRIEF_CHARS = 40_000;
const VERDICT_CHARS = 2_500;
const OUTPUT_CHARS = 6_000;

const clip = (text: string, max: number) => (text.length > max ? `${text.slice(0, max)} […]` : text);
const time = (at: number) => new Date(at).toISOString().slice(11, 19);

function render(line: InsightLine, request: InsightRequest): string | null {
  if ("outcome" in line) return `${time(line.at)} FIN DE SESSION ${clip(JSON.stringify(line.outcome), VERDICT_CHARS)}`;
  if (!("event" in line)) return null;
  const { event } = line;
  const about = (task: string | null) => request.task === null || task === request.task || (task !== null && task.startsWith(`${request.task}/`));
  switch (event.type) {
    case "gate": {
      if (request.question === "verdicts" || request.question === "task") {
        if (!about(event.task)) return null;
      } else if (request.question === "failures" && event.verdict === "pass") return null;
      const budget = event.budget === null ? `${event.spent} refus` : `${event.spent}/${event.budget}`;
      return `${time(line.at)} VERDICT ${event.task} · ${event.gate} · tour ${event.round} · ${event.verdict === "pass" ? "accepte" : "refuse"} (${budget})${event.text ? `\n${clip(event.text, VERDICT_CHARS)}` : ""}`;
    }
    case "phase":
      return request.question === "task" ? null : `${time(line.at)} PHASE ${event.phase} : ${event.tasks.map((task) => `${task.key}=${task.status}`).join(", ")}`;
    case "output":
      return request.question === "task" && about(event.task) ? `${time(line.at)} RESULTAT ${event.task}\n${clip(JSON.stringify(event.value, null, 1), OUTPUT_CHARS)}` : null;
    case "warning":
      return `${time(line.at)} AVERTISSEMENT ${event.task ?? ""} ${event.text}`;
    case "command":
      return event.status === "end" && event.passed === false && about(event.task) ? `${time(line.at)} COMMANDE ECHOUEE ${event.task} · ${event.label} : ${event.command} (code ${event.exitCode ?? "?"})` : null;
    case "workflow": {
      const workflow = event.event;
      const key = workflow.key ?? null;
      return workflow.type === "task" && workflow.status === "failed" && about(key) ? `${time(line.at)} TACHE EN ECHEC ${key} : ${clip(workflow.error ?? "", VERDICT_CHARS)}` : null;
    }
    case "question":
      return request.question === "stop" ? `${time(line.at)} QUESTION POSEE ${event.request.question.split("\n")[0]}` : null;
    default:
      return null;
  }
}

/**
 * The part of the run's journal a question needs, oldest first, cut from the start when too long:
 * the end of a run is where its explanation lies.
 */
export function insightBrief(lines: readonly InsightLine[], request: InsightRequest): string {
  const rendered = lines.flatMap((line) => render(line, request) ?? []);
  const kept: string[] = [];
  let size = 0;
  for (const entry of rendered.toReversed()) {
    if (size + entry.length > BRIEF_CHARS) break;
    kept.push(entry);
    size += entry.length + 1;
  }
  const cut = kept.length < rendered.length ? [`(${rendered.length - kept.length} entree(s) plus anciennes coupees)`] : [];
  return [...cut, ...kept.toReversed()].join("\n") || "(rien dans le journal pour cette question)";
}
