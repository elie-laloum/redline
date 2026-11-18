import * as clack from "@clack/prompts";
import type { DriveOutcome } from "../app/driver.ts";
import { gapCount, renderGap } from "../domain/conformity.ts";
import { renderReviewedPoint, stillOpen } from "../domain/open-points.ts";
import type { Tone } from "./dashboard/model.ts";

const NEXT: Readonly<Record<string, string>> = {
  convergence: "Les agents n'ont pas converge dans leur budget. Lis le dernier retour, puis relance avec une consigne : bun redline resume {KEY} --fresh --note \"...\"",
  environment: "L'environnement a bloque (commande, conteneurs, CI, reseau). Repare-le, puis : bun redline resume {KEY}",
  arbitrage: "Une decision te revient. Tranche-la, puis : bun redline resume {KEY} --fresh --note \"ta decision\"",
};

export function nextStep(key: string, kind: string): string {
  return (NEXT[kind] ?? "").replaceAll("{KEY}", key);
}

export function report(key: string, outcome: DriveOutcome): number {
  switch (outcome.status) {
    case "done": {
      const { publication } = outcome;
      clack.log.success(publication.mergeRequests.map((request) => `${request.repo} : ${request.url}`).join("\n") || "Aucune MR.");
      const published = [publication.slack ? `Canal #${publication.slack.channel.name}` : "", publication.jira.transition ? `ticket passe en ${publication.jira.transition}` : ""].filter(Boolean);
      if (published.length) clack.log.info(published.join(" — "));
      if (publication.memory.commit) clack.log.info(`Memoire : commit ${publication.memory.commit}`);
      const gaps = publication.conformity.flatMap((report) => report.gaps.map((gap) => `- ${report.repo} — ${renderGap(gap)}`));
      if (gaps.length) clack.log.warn(`Ecarts au cadrage constates a la cloture, en tete des MR :\n${gaps.join("\n")}`);
      const reserves = stillOpen(publication.openPoints);
      if (reserves.length) {
        clack.log.warn(`Points encore ouverts, en tete des MR ; le ticket garde son statut :\n${reserves.map((point) => `- ${renderReviewedPoint(point)}`).join("\n")}`);
        clack.outro(`${key} livre avec reserves.`);
        return 0;
      }
      clack.outro(`${key} publie.`);
      return 0;
    }
    case "escalated": {
      const { escalation } = outcome;
      clack.log.error(`Escalade ${escalation.kind} sur ${escalation.task}\n${escalation.detail}`);
      clack.outro(nextStep(key, escalation.kind));
      return 2;
    }
    case "paused":
      clack.outro(outcome.detail);
      return 3;
    case "cancelled":
      clack.outro(`Interrompu. Reprends avec : bun redline resume ${key}`);
      return 130;
    case "waiting":
      clack.outro(`Des questions attendent. Reprends avec : bun redline resume ${key}`);
      return 130;
  }
}

/** The outcome as the dashboard's banner says it. */
export function outcomeNotice(key: string, outcome: DriveOutcome): { readonly tone: Tone; readonly text: string } {
  switch (outcome.status) {
    case "done": {
      const requests = outcome.publication.mergeRequests.length;
      const channel = outcome.publication.slack ? `, canal #${outcome.publication.slack.channel.name}` : "";
      const reserves = stillOpen(outcome.publication.openPoints);
      const gaps = gapCount(outcome.publication.conformity);
      const departures = gaps ? `, ${gaps} ecart(s) au cadrage` : "";
      if (reserves.length) return { tone: "warning", text: `${key} livre avec reserves : ${requests} MR${channel}, ${reserves.length} point(s) encore ouvert(s) (${reserves.map((point) => point.id).join(", ")})${departures}.` };
      return { tone: gaps ? "warning" : "success", text: `${key} publie : ${requests} MR${channel}${departures}.` };
    }
    case "escalated": {
      const { escalation } = outcome;
      return { tone: "error", text: `Escalade ${escalation.kind} sur ${escalation.task} : ${escalation.detail}\n${nextStep(key, escalation.kind)}` };
    }
    case "paused":
      return { tone: "warning", text: outcome.detail };
    case "cancelled":
      return { tone: "warning", text: `Interrompu. Reprends avec : bun redline resume ${key}` };
    case "waiting":
      return { tone: "warning", text: `Des questions attendent. Reprends avec : bun redline resume ${key}` };
  }
}
