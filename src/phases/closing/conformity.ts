import { defineTask, type Task } from "@elie-laloum/outpost/workflows";
import { conformityChecker } from "../../agents/conformity-checker.ts";
import { ask } from "../../agents/role.ts";
import { bindingDecisions, type ConformityReport } from "../../domain/conformity.ts";
import { digest } from "../../domain/digest.ts";
import { targetsOf, withTarget } from "../delivery/context.ts";
import { cached, session } from "../run.ts";
import type { ClosingContext } from "./context.ts";

/** A report, not a gate: the gaps are published with the merge request, and nothing is sent back to the developer. */
export function conformityTask(run: ClosingContext): Task<readonly ConformityReport[]> {
  const decisions = bindingDecisions(run.framing.functional.arbitrages, run.framing.technical.arbitrages);
  const delivered = new Map(run.delivered.map((repo) => [repo.repo, repo]));
  const targets = targetsOf(run).filter((target) => delivered.has(target.repo.name));
  return defineTask({
    key: "conformity",
    cache: cached(run, ["conformity-checker"], () => digest({ decisions, plan: run.framing.plan.repos, delivered: run.delivered })),
    async perform(context) {
      const reports: ConformityReport[] = [];
      for (const target of targets) {
        const base = delivered.get(target.repo.name)?.base ?? `origin/${target.repo.baseBranch}`;
        const checklist = [...target.entry.tests, ...target.entry.code].map((line) => ({ id: line.id, text: line.criterion }));
        const reply = await withTarget(run, target, (opened) =>
          opened.withSandbox((sandbox) =>
            ask(context, session(run, sandbox, { task: "conformity" }), conformityChecker, { ticket: run.framing.ticket, notes: run.ledger.notes, repo: target.repo.name, decisions, checklist, base }),
          ),
        );
        const texts = new Map([...decisions, ...checklist].map((entry) => [entry.id, entry.text]));
        const gaps = [...reply.decisions, ...reply.checklist]
          .filter((check) => check.verdict === "ecart")
          .map((check) => ({ id: check.id, text: texts.get(check.id) ?? "", evidence: check.evidence, comment: check.comment }));
        reports.push({ repo: target.repo.name, gaps });
      }
      return reports;
    },
  });
}
