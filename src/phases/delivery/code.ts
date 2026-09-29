import { defineTask, type LoopTaskContext, type Task, type TaskContext, type WorkflowJson } from "@elie-laloum/outpost";
import { type Appeal, appealArbiter } from "../../agents/appeal-arbiter.ts";
import { codeAdversary } from "../../agents/code-adversary.ts";
import { developer } from "../../agents/developer.ts";
import { bullets } from "../../agents/render.ts";
import { ask } from "../../agents/role.ts";
import { testAdversary } from "../../agents/test-adversary.ts";
import { git } from "../../adapters/git.ts";
import { type CommandKind, declaredTestKinds } from "../../domain/config.ts";
import type { CommitIntent } from "../../domain/commit-message.ts";
import { digest } from "../../domain/digest.ts";
import { failingLines, renderCheck, renderVerdicts } from "../../domain/feedback.ts";
import { batches, type PlanCode } from "../../domain/plan.ts";
import type { Contradiction } from "../../domain/scope.ts";
import { isTestFile } from "../../domain/zones.ts";
import { type Converged, converge, type Gate, type Verdict } from "../../workflow/converge.ts";
import { cached, session } from "../run.ts";
import { commitWork } from "./commit.ts";
import { arbitragesOf, type DeliveryContext, type RepoTarget, seedOf, withTarget } from "./context.ts";
import type { TestsCandidate } from "./tests.ts";

export interface CodeCandidate {
  readonly head: string;
  readonly reverted: readonly string[];
  readonly appeals: readonly Appeal[];
  readonly contradictions: readonly Contradiction[];
}

type DeveloperTurn = { feedback: string | null; lines: readonly PlanCode[] };

async function developerTurn(run: DeliveryContext, target: RepoTarget, context: TaskContext, turn: DeveloperTurn): Promise<CodeCandidate> {
  const { settings } = run.app.configuration;
  return withTarget(run, target, async (opened) => {
    const baseline = await git(opened.directory, ["rev-parse", "HEAD"]);
    const reply = await opened.withSandbox((sandbox) =>
      ask(context, session(run, sandbox), developer, {
        ticket: run.framing.ticket,
        entry: target.entry,
        batch: turn.lines,
        arbitrages: arbitragesOf(run),
        checks: checksAdvice(run, target),
        feedback: turn.feedback,
      }),
    );
    const committed = await commitWork({
      directory: opened.directory,
      zone: "code",
      baseline,
      intent: reply.commit as CommitIntent | null,
      fallback: { type: "fix", subject: "address review feedback" },
      ticket: run.ledger.key,
      ...(settings.git.committer ? { committer: settings.git.committer } : {}),
    });
    return {
      head: await git(opened.directory, ["rev-parse", "HEAD"]),
      reverted: committed.reverted,
      appeals: reply.appeals,
      contradictions: reply.contradictions.map((entry) => ({ ...entry, raisedBy: `developer/${target.repo.name}` })),
    };
  });
}

function checksAdvice(run: DeliveryContext, target: RepoTarget): string {
  if (!run.app.configuration.settings.sandbox.agentChecks) {
    return "Ne lance aucune commande de build, de lint ni de test : redline les lance sur la machine apres ton tour et te renvoie les erreurs.";
  }
  const commands = (["typecheck", "lint"] as const).flatMap((kind) => target.repo.commands[kind] ?? []);
  return commands.length ? `Tu peux verifier ton travail avec : ${commands.map((command) => `\`${command}\``).join(", ")}. N'installe rien.` : "";
}

export function batchTasks(run: DeliveryContext, target: RepoTarget, tests: Task<Converged<TestsCandidate>>): Task<CodeCandidate>[] {
  const size = run.ledger.budgets.developerBatchLines;
  const tasks: Task<CodeCandidate>[] = [];
  for (const [index, lines] of batches(target.entry.code, size).entries()) {
    const previous = tasks.at(-1);
    tasks.push(
      defineTask({
        key: `${target.repo.name}.code-${index + 1}`,
        after: [tests, ...(previous ? [previous] : [])],
        cache: cached(run, ["developer"], () => digest({ entry: target.entry, lines, branch: target.branch, arbitrages: arbitragesOf(run) })),
        perform: (context) => developerTurn(run, target, context, { feedback: null, lines }),
      }),
    );
  }
  return tasks;
}

export function codeTask(run: DeliveryContext, target: RepoTarget, tests: Task<Converged<TestsCandidate>>, lots: readonly Task<CodeCandidate>[]): Task<Converged<CodeCandidate>> {
  const key = `${target.repo.name}.code`;
  const budgets = run.ledger.budgets;
  return converge<CodeCandidate>({
    key,
    after: [tests, ...lots],
    cache: cached(run, ["developer", "appeal-arbiter", "test-adversary", "code-adversary"], () => digest({ entry: target.entry, branch: target.branch, seed: seedOf(run, key) })),
    seed: () => seedOf(run, key),
    make: async (context, carry) => {
      if (carry.round === 1 && !carry.feedback) {
        const produced = lots.map((lot) => context.value(lot));
        return {
          head: produced.at(-1)?.head ?? context.value(tests).candidate.head,
          reverted: produced.flatMap((lot) => lot.reverted),
          appeals: produced.flatMap((lot) => lot.appeals),
          contradictions: produced.flatMap((lot) => lot.contradictions),
        };
      }
      return developerTurn(run, target, context, { feedback: carry.feedback?.text ?? null, lines: target.entry.code });
    },
    gates: [
      appealsGate(run, target, budgets.testDispute, budgets.disputeBeforeEscalation),
      integrityGate(run, target, tests, budgets.testAdversary),
      greenGate(run, target, key, budgets.greenChecker),
      codeAdversaryGate(run, target, budgets.codeAdversary),
    ],
  });
}

function appealsGate(run: DeliveryContext, target: RepoTarget, budget: number, threshold: number): Gate<CodeCandidate> {
  return {
    name: "recours",
    budget,
    judge: async (context, candidate, carry): Promise<Verdict> => {
      if (candidate.reverted.length > 0) {
        return { kind: "feedback", text: `Tu as modifie des tests, et ces changements ont ete annules. Passe par un recours :\n${bullets(candidate.reverted)}` };
      }
      if (candidate.appeals.length === 0) return { kind: "pass" };
      const counts: Record<string, number> = { ...((carry.memo.recours as Record<string, number> | undefined) ?? {}) };
      const decisions: string[] = [];
      for (const appeal of candidate.appeals) {
        const subject = appeal.test ?? `zone:${digest(appeal.reason)}`;
        counts[subject] = (counts[subject] ?? 0) + 1;
        if (appeal.kind === "test-conteste" && (counts[subject] ?? 0) >= threshold) {
          return { kind: "arbitrage", text: `${subject} conteste ${counts[subject]} fois par le developpeur : ${appeal.reason}` };
        }
        decisions.push(await arbitrate(run, target, context, appeal, subject));
      }
      return { kind: "feedback", text: `Reponses a tes recours :\n${bullets(decisions)}`, memo: counts as WorkflowJson };
    },
  };
}

async function arbitrate(run: DeliveryContext, target: RepoTarget, context: LoopTaskContext, appeal: Appeal, subject: string): Promise<string> {
  const { settings } = run.app.configuration;
  return withTarget(run, target, async (opened) => {
    const baseline = await git(opened.directory, ["rev-parse", "HEAD"]);
    const reply = await opened.withSandbox((sandbox) => ask(context, session(run, sandbox), appealArbiter, { repo: target.repo.name, tests: target.entry.tests, appeal, previous: [] }));
    if (reply.decision === "accepte") {
      await commitWork({
        directory: opened.directory,
        zone: "tests",
        baseline,
        intent: reply.commit as CommitIntent | null,
        fallback: { type: "test", subject: "settle a disputed test" },
        ticket: run.ledger.key,
        ...(settings.git.committer ? { committer: settings.git.committer } : {}),
      });
    }
    return `${subject} — ${reply.decision} : ${reply.reason}`;
  });
}

function integrityGate(run: DeliveryContext, target: RepoTarget, tests: Task<Converged<TestsCandidate>>, budget: number): Gate<CodeCandidate> {
  return {
    name: "tests-modifies",
    budget,
    judge: (context) =>
      withTarget(run, target, async (opened): Promise<Verdict> => {
        const since = context.value(tests).candidate.head;
        const changed = (await git(opened.directory, ["diff", "--name-only", `${since}..HEAD`])).split("\n").filter((path) => path && isTestFile(path));
        if (changed.length === 0 || target.entry.tests.length === 0) return { kind: "pass" };
        const verdict = await opened.withSandbox((sandbox) =>
          ask(context, session(run, sandbox), testAdversary, { ticket: run.framing.ticket, repo: target.repo.name, tests: target.entry.tests, files: changed, kinds: declaredTestKinds(target.repo) }),
        );
        const failing = failingLines(verdict.lines);
        return failing.length === 0 ? { kind: "pass" } : { kind: "arbitrage", text: `Des tests modifies par l'arbitre ne tiennent plus la checklist :\n${renderVerdicts(failing)}` };
      }),
  };
}

function greenGate(run: DeliveryContext, target: RepoTarget, key: string, budget: number): Gate<CodeCandidate> {
  const kinds: CommandKind[] = ["typecheck", "lint", ...declaredTestKinds(target.repo)];
  return {
    name: "vert",
    budget,
    judge: () =>
      withTarget(run, target, async (opened): Promise<Verdict> => {
        const checks = run.app.checks(run.ledger.key);
        const failures: string[] = [];
        for (const kind of kinds) {
          const result = await checks.run(target.repo, kind, opened.directory, { label: `${key}-${kind}`, ...(run.signal ? { signal: run.signal } : {}) });
          if (result.stoppedBy === "silence" || result.stoppedBy === "timeout") return { kind: "environment", text: renderCheck(result) };
          if (!result.passed) failures.push(renderCheck(result));
        }
        return failures.length === 0 ? { kind: "pass" } : { kind: "feedback", text: `Les verifications de la machine echouent :\n\n${failures.join("\n\n")}` };
      }),
  };
}

function codeAdversaryGate(run: DeliveryContext, target: RepoTarget, budget: number): Gate<CodeCandidate> {
  return {
    name: "adversaire",
    budget,
    judge: (context) =>
      withTarget(run, target, async (opened): Promise<Verdict> => {
        const base = await git(opened.directory, ["merge-base", "HEAD", `origin/${target.repo.baseBranch}`]);
        const verdict = await opened.withSandbox((sandbox) =>
          ask(context, session(run, sandbox), codeAdversary, { ticket: run.framing.ticket, repo: target.repo.name, code: target.entry.code, arbitrages: arbitragesOf(run), base }),
        );
        const failing = failingLines(verdict.lines);
        return failing.length === 0 ? { kind: "pass" } : { kind: "feedback", text: `L'adversaire du code refuse ces lignes :\n${renderVerdicts(failing)}` };
      }),
  };
}
