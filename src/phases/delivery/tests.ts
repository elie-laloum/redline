import { existsSync } from "node:fs";
import { join } from "node:path";
import { defineTask, type LoopTaskContext, type Task } from "@elie-laloum/outpost";
import { redChecker } from "../../agents/red-checker.ts";
import { bullets } from "../../agents/render.ts";
import { ask } from "../../agents/role.ts";
import { testAdversary } from "../../agents/test-adversary.ts";
import { testWriter } from "../../agents/test-writer.ts";
import { git } from "../../adapters/git.ts";
import { declaredTestKinds, type TestKind } from "../../domain/config.ts";
import { digest } from "../../domain/digest.ts";
import { failingLines, renderCheck, renderVerdicts } from "../../domain/feedback.ts";
import { isTestFile } from "../../domain/zones.ts";
import type { CheckResult } from "../../ports/checks.ts";
import type { RepoWorkspace } from "../../ports/sandboxes.ts";
import { type Converged, converge, type Gate, type Verdict } from "../../workflow/converge.ts";
import { Escalation } from "../../workflow/escalation.ts";
import { cached, session } from "../run.ts";
import { commitWork } from "./commit.ts";
import { arbitragesOf, type DeliveryContext, type RepoTarget, seedOf, withTarget } from "./context.ts";
import type { Prepared } from "./workspace.ts";

export interface TestsCandidate {
  readonly files: readonly { readonly path: string; readonly tests: readonly string[] }[];
  readonly reverted: readonly string[];
  readonly head: string;
}

export function testsTask(run: DeliveryContext, target: RepoTarget, workspace: Task<Prepared>): Task<Converged<TestsCandidate>> {
  const key = `${target.repo.name}.tests`;
  if (target.entry.tests.length === 0) {
    return defineTask({
      key,
      after: [workspace],
      perform: async (context) => {
        const head = await git(context.value(workspace).directory, ["rev-parse", "HEAD"]);
        return { candidate: { files: [], reverted: [], head }, carry: { round: 0, spent: {}, feedback: null, memo: {} } };
      },
    });
  }
  const { settings } = run.app.configuration;
  const budgets = run.ledger.budgets;
  return converge<TestsCandidate>({
    key,
    after: [workspace],
    cache: cached(run, ["test-writer", "test-adversary", "red-checker"], () => digest({ entry: target.entry, arbitrages: arbitragesOf(run), branch: target.branch, seed: seedOf(run, key) })),
    seed: () => seedOf(run, key),
    make: (context, carry) =>
      withTarget(run, target, async (opened) => {
        const baseline = await git(opened.directory, ["rev-parse", "HEAD"]);
        const reply = await opened.withSandbox((sandbox) =>
          ask(context, session(run, sandbox), testWriter, {
            ticket: run.framing.ticket,
            entry: target.entry,
            arbitrages: arbitragesOf(run),
            kinds: declaredTestKinds(target.repo),
            feedback: carry.feedback?.text ?? null,
          }),
        );
        if (reply.uncoverable.length > 0) {
          throw new Escalation("arbitrage", key, `lignes que le registre ne permet pas de tester :\n${bullets(reply.uncoverable.map((entry) => `${entry.id} : ${entry.reason}`))}`);
        }
        const committed = await commitWork({
          directory: opened.directory,
          zone: "tests",
          baseline,
          intent: reply.commit,
          fallback: { type: "test", subject: "add tests" },
          ticket: run.ledger.key,
          ...(settings.git.committer ? { committer: settings.git.committer } : {}),
        });
        return { files: reply.files, reverted: committed.reverted, head: await git(opened.directory, ["rev-parse", "HEAD"]) };
      }),
    gates: [zoneGate(budgets.testAdversary), adversaryGate(run, target, budgets.testAdversary), redGate(run, target, key, budgets.redChecker)],
  });
}

function zoneGate(budget: number): Gate<TestsCandidate> {
  return {
    name: "zone",
    budget,
    async judge(_context, candidate) {
      const outside = [...candidate.reverted, ...candidate.files.map((file) => file.path).filter((path) => !isTestFile(path))];
      return outside.length === 0 ? { kind: "pass" } : { kind: "feedback", text: `Ces fichiers ne sont pas des fichiers de test et ont ete annules :\n${bullets([...new Set(outside)])}` };
    },
  };
}

function adversaryGate(run: DeliveryContext, target: RepoTarget, budget: number): Gate<TestsCandidate> {
  return {
    name: "adversaire",
    budget,
    judge: (context, candidate) =>
      withTarget(run, target, async (opened) => {
        const verdict = await opened.withSandbox((sandbox) =>
          ask(context, session(run, sandbox), testAdversary, {
            ticket: run.framing.ticket,
            repo: target.repo.name,
            tests: target.entry.tests,
            files: candidate.files.map((file) => file.path),
            kinds: declaredTestKinds(target.repo),
          }),
        );
        const failing = failingLines(verdict.lines);
        if (failing.length === 0 && verdict.weaknesses.length === 0) return { kind: "pass" };
        const weaknesses = verdict.weaknesses.map((entry) => `${entry.file} : ${entry.problem}`);
        return { kind: "feedback", text: [renderVerdicts(failing), weaknesses.length ? `Tests fragiles :\n${bullets(weaknesses)}` : ""].filter(Boolean).join("\n\n") };
      }),
  };
}

function redGate(run: DeliveryContext, target: RepoTarget, key: string, budget: number): Gate<TestsCandidate> {
  const kinds = [...new Set(target.entry.tests.map((test) => test.kind))] as TestKind[];
  return {
    name: "rouge",
    budget,
    judge: (context, candidate) =>
      withTarget(run, target, async (opened): Promise<Verdict> => {
        const paths = candidate.files.map((file) => file.path).filter((path) => existsSync(join(opened.directory, path)));
        const checks = run.app.checks(run.ledger.key);
        const results: CheckResult[] = [];
        for (const kind of kinds) results.push(await checks.run(target.repo, kind, opened.directory, { paths, label: `${key}-${kind}`, ...(run.signal ? { signal: run.signal } : {}) }));
        const stalled = results.find((result) => result.stoppedBy === "silence" || result.stoppedBy === "timeout");
        if (stalled) return { kind: "environment", text: renderCheck(stalled) };
        const failed = results.filter((result) => !result.passed);
        if (failed.length === 0) {
          return { kind: "feedback", text: `Les nouveaux tests passent deja, avant toute implementation : ils ne prouvent rien. Commande(s) : ${results.map((result) => `\`${result.command}\``).join(", ")}.` };
        }
        return classify(run, context, opened, target, paths, failed);
      }),
  };
}

async function classify(run: DeliveryContext, context: LoopTaskContext, opened: RepoWorkspace, target: RepoTarget, files: readonly string[], failed: readonly CheckResult[]): Promise<Verdict> {
  const reply = await opened.withSandbox((sandbox) =>
    ask(context, session(run, sandbox), redChecker, {
      repo: target.repo.name,
      files,
      command: failed.map((result) => result.command).join(" ; "),
      output: failed.map(renderCheck).join("\n\n"),
    }),
  );
  if (reply.environment.blocked) return { kind: "environment", text: reply.environment.reason };
  const wrong = reply.tests.filter((test) => test.verdict !== "bon-rouge");
  return wrong.length === 0 ? { kind: "pass" } : { kind: "feedback", text: `Ces tests ne sont pas rouges pour la bonne raison :\n${bullets(wrong.map((test) => `${test.name} — ${test.verdict} : ${test.reason}`))}` };
}
