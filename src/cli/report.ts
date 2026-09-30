import * as clack from "@clack/prompts";
import type { DriveOutcome } from "../app/driver.ts";

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
      clack.log.info(`Canal #${publication.slack.channel.name}${publication.jira.transition ? ` — ticket passe en ${publication.jira.transition}` : ""}`);
      if (publication.memory.commit) clack.log.info(`Memoire : commit ${publication.memory.commit}`);
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
