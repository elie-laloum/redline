import { defineTask, type Task } from "@elie-laloum/outpost";
import { memoryPlanner } from "../../agents/memory-planner.ts";
import { arbitrages, bullets } from "../../agents/render.ts";
import { ask } from "../../agents/role.ts";
import { commitHome } from "../../app/home.ts";
import { commitMemory, pullMemory } from "../../app/memory-repository.ts";
import { digest } from "../../domain/digest.ts";
import type { Frontmatter } from "../../domain/memory.ts";
import { type ContradictionDecision, type MemoryOp, memoryOpProblems } from "../../domain/memory-ops.ts";
import { renderPlan } from "../../domain/plan.ts";
import { type Converged, converge } from "../../workflow/converge.ts";
import { cached, emit, type RunContext, withReader } from "../run.ts";
import type { ClosingContext } from "./context.ts";

export interface MemoryPlan {
  readonly operations: readonly MemoryOp[];
  readonly decisions: readonly ContradictionDecision[];
}

export interface MemoryApplied {
  readonly operations: readonly { readonly action: string; readonly path: string; readonly why: string }[];
  readonly commit: string | null;
}

export function contradictionsOf(run: ClosingContext) {
  return [...run.framing.contradictions, ...run.delivered.flatMap((repo) => repo.contradictions)];
}

export function memoryPlanTask(run: ClosingContext): Task<Converged<MemoryPlan>> {
  const { settings } = run.app.configuration;
  const contradictions = contradictionsOf(run);
  return converge<MemoryPlan>({
    key: "memory-plan",
    cache: cached(run, ["memory-planner"], () => digest({ framing: run.framing, delivered: run.delivered })),
    ...(run.events ? { events: run.events } : {}),
    make: (context, carry) =>
      withReader(run, "memory-planner", { task: "memory-plan" }, (session) =>
        ask(context, session, memoryPlanner, {
          ticket: run.framing.ticket,
          notes: run.ledger.notes,
          arbitrages: arbitrages([...run.framing.functional.arbitrages, ...run.framing.technical.arbitrages]),
          plan: renderPlan(run.framing.plan),
          delivered: run.delivered.map((repo) => `### ${repo.repo} (${repo.branch})\n${bullets(repo.commits)}`).join("\n\n"),
          contradictions: bullets(contradictions.map((entry) => `memory/${entry.note} : « ${entry.claim} » contredit par ${entry.evidence} (${entry.raisedBy})`), "(aucune)"),
          index: indexOf(run),
          today: new Date().toISOString().slice(0, 10),
          maxNoteLines: settings.memory.maxNoteLines,
          feedback: carry.feedback?.text ?? null,
        }),
      ),
    gates: [
      {
        name: "validite",
        budget: run.ledger.budgets.memoryRepairs,
        async judge(_context, plan) {
          const problems = memoryOpProblems(plan.operations, run.app.memory().list(), settings.memory.maxNoteLines, contradictions.map((entry) => entry.note), plan.decisions);
          return problems.length === 0 ? { kind: "pass" } : { kind: "feedback", text: `Le plan memoire ne s'applique pas tel quel :\n${bullets(problems)}` };
        },
      },
    ],
  });
}

export function memoryApplyTask(run: RunContext, plan: Task<Converged<MemoryPlan>>): Task<MemoryApplied> {
  return defineTask({
    key: "memory-apply",
    after: [plan],
    async perform(context) {
      const memory = run.app.memoryRepository;
      const warn = (text: string | null) => {
        if (text) emit(run, { type: "warning", task: "memory-apply", text });
      };
      // Someone else's run may have pushed notes since this one started.
      warn(await pullMemory(memory, run.app.configuration.settings.git.committer));
      const store = run.app.memory();
      const { operations } = context.value(plan).candidate;
      for (const op of operations) {
        if (op.action === "delete") {
          if (store.read(op.path)) store.remove(op.path);
        } else {
          store.write(op.path, op.frontmatter as Frontmatter, op.body);
        }
      }
      const message = `memory: ${run.ledger.key}`;
      let commit: string | null;
      if (memory.separate) {
        const committed = await commitMemory(memory, message, run.app.configuration.settings.git.committer);
        warn(committed.warning);
        commit = committed.commit;
        await commitHome(run.app.paths, message, ["tickets"]);
      } else {
        commit = await commitHome(run.app.paths, message);
      }
      return { operations: operations.map(({ action, path, why }) => ({ action, path, why })), commit };
    },
  });
}

function indexOf(run: RunContext): string {
  const notes = run.app.memory().list();
  if (notes.length === 0) return "(memoire vide)";
  return notes.map((note) => `- memory/${note.path} (${note.frontmatter.scope}, ${note.lines} lignes) — ${note.body.split("\n")[0] ?? ""}`).join("\n");
}
