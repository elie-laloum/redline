import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { defineTask, type Task, type TaskContext } from "@elie-laloum/outpost";
import { ask } from "../../agents/role.ts";
import { scopeScout } from "../../agents/scope-scout.ts";
import { expandTilde } from "../../app/paths.ts";
import { eligibleRepos, orderByLevel, type RepoEntry } from "../../domain/config.ts";
import { digest } from "../../domain/digest.ts";
import { parseEvidence } from "../../domain/evidence.ts";
import { renderNotes, selectNotes } from "../../domain/memory-selection.ts";
import { type Contradiction, type Exclusion, preselect, type Scope, type ScopeEntry } from "../../domain/scope.ts";
import type { TicketSnapshot } from "../../domain/ticket.ts";
import type { Interviewed } from "../../workflow/interview.ts";
import { Escalation } from "../../workflow/escalation.ts";
import { pool } from "../../workflow/pool.ts";
import { cached, type RunContext, withReader } from "../run.ts";
import { type GrillOutcome, renderGrill } from "./grills.ts";

export interface ScopeOutcome {
  readonly scope: Scope;
  readonly contradictions: readonly Contradiction[];
}

type Scouted = { readonly repo: RepoEntry; readonly entry: ScopeEntry | null; readonly exclusion: Exclusion | null; readonly contradictions: readonly Contradiction[] };

export function evidenceProblems(root: string, evidence: readonly string[]): string[] {
  return evidence.flatMap((line) => {
    const parsed = parseEvidence(line);
    if (!parsed) return [`« ${line} » n'est pas de la forme chemin:ligne`];
    const file = join(root, parsed.file);
    if (!existsSync(file)) return [`${parsed.file} n'existe pas dans le repo`];
    const lines = readFileSync(file, "utf8").split("\n").length;
    return parsed.line > lines ? [`${parsed.file} n'a que ${lines} lignes, pas ${parsed.line}`] : [];
  });
}

export function scopeTask(run: RunContext, deps: { ticket: Task<TicketSnapshot>; functional: Task<Interviewed<GrillOutcome>> }): Task<ScopeOutcome> {
  const { registry, settings } = run.app.configuration;
  return defineTask({
    key: "scope",
    after: [deps.ticket, deps.functional],
    cache: cached(run, ["scope-scout"], (context) => digest({ ticket: context.value(deps.ticket), functional: context.value(deps.functional).output, registry: registry.repositories.map((repo) => [repo.name, repo.path]) })),
    async perform(context) {
      const ticket = context.value(deps.ticket);
      const functional = context.value(deps.functional).output;
      const eligible = eligibleRepos(registry, ticket.squad);
      const present = eligible.filter((repo) => existsSync(expandTilde(repo.path)));
      const absent = eligible.filter((repo) => !present.includes(repo)).map((repo) => ({ repo: repo.name, reason: `absent du disque (${repo.path})` }));
      const { candidates, skipped } = preselect(present, ticket, functional.arbitrages.map((entry) => entry.answer).join("\n"));
      const scouted = await pool(candidates, settings.scope.concurrency, (repo) => scout(run, context, repo, ticket, renderGrill(functional)));
      const impacted = orderByLevel(scouted.flatMap((result) => (result.entry ? [{ ...result.entry, name: result.repo.name }] : []))).map(({ name: _, ...entry }) => entry);
      if (impacted.length === 0) throw new Escalation("arbitrage", "scope", "aucun repo du registre ne ressort comme impacte : le ticket vise-t-il un repo absent du registre ?");
      return {
        scope: { impacted, excluded: [...scouted.flatMap((result) => result.exclusion ?? []), ...skipped, ...absent] },
        contradictions: scouted.flatMap((result) => result.contradictions),
      };
    },
  });
}

async function scout(run: RunContext, context: TaskContext, repo: RepoEntry, ticket: TicketSnapshot, functional: string): Promise<Scouted> {
  const root = expandTilde(repo.path);
  const memory = renderNotes(selectNotes(run.app.memory().list(), { text: `${ticket.title}\n${ticket.description}`, repos: [repo.name] }, run.app.configuration.settings.memory.selection));
  return withReader(run, `scout-${repo.name}`, async (session, reader) => {
    let feedback: string | null = null;
    for (let attempt = 1; attempt <= 2; attempt += 1) {
      const reply = await ask(context, session, scopeScout, { ticket, notes: run.ledger.notes, functional, repo, path: reader.repoPath(repo.name), memory, feedback });
      const contradictions = reply.contradictions.map((entry) => ({ ...entry, raisedBy: `scope-scout/${repo.name}` }));
      if (!reply.impacted) return { repo, entry: null, exclusion: { repo: repo.name, reason: reply.reason }, contradictions };
      const problems = evidenceProblems(root, reply.evidence);
      if (problems.length === 0) return { repo, entry: { repo: repo.name, level: repo.level, area: reply.area, evidence: reply.evidence }, exclusion: null, contradictions };
      feedback = `Ces preuves ne tiennent pas, corrige-les avec des chemins relatifs a la racine du repo :\n${problems.map((problem) => `- ${problem}`).join("\n")}`;
    }
    throw new Escalation("convergence", `scope/${repo.name}`, `preuves invalides apres correction : ${feedback}`);
  });
}
