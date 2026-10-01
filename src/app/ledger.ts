import { existsSync, readFileSync } from "node:fs";
import * as v from "valibot";
import { parse } from "yaml";
import { writeYamlAtomic } from "../adapters/yaml.ts";
import { SettingsSchema } from "../domain/config.ts";
import { ESCALATION_KINDS } from "../domain/escalation.ts";
import { fail } from "../domain/failure.ts";
import { PlanSchema } from "../domain/plan.ts";
import type { Publication } from "../phases/closing/workflow.ts";
import type { DeliveredRepo } from "../phases/delivery/summary.ts";
import type { FramingOutcome } from "../phases/framing/workflow.ts";
import { type Paths, ticketFile } from "./paths.ts";

export const PHASES = ["framing", "delivery", "closing", "done", "escalated"] as const;
export const REOPEN_TARGETS = ["functional", "technical", "plan"] as const;

const json = v.unknown();

const ContradictionSchema = v.object({ note: v.string(), claim: v.string(), evidence: v.string(), raisedBy: v.string() });
const ArbitrageSchema = v.object({ question: v.string(), answer: v.string(), why: v.string() });
const GrillOutcomeSchema = v.object({ arbitrages: v.array(ArbitrageSchema), contradictions: v.array(ContradictionSchema) });
const TicketReferenceSchema = v.object({ key: v.string(), relation: v.string() });
const TokensSchema = v.object({ input: v.number(), cached: v.number(), output: v.number() });

const FramingOutcomeSchema: v.GenericSchema<unknown, FramingOutcome> = v.object({
  decision: v.picklist(["approve", "amend", "reject-functional", "reject-technical"]),
  note: v.nullable(v.string()),
  ticket: v.object({
    key: v.string(),
    squad: v.string(),
    title: v.string(),
    description: v.string(),
    criteria: v.array(v.object({ id: v.string(), text: v.string() })),
    issueType: v.string(),
    status: v.string(),
    url: v.string(),
    labels: v.array(v.string()),
    links: v.array(v.string()),
    references: v.array(TicketReferenceSchema),
    related: v.array(
      v.union([
        v.object({ ...TicketReferenceSchema.entries, title: v.string(), issueType: v.string(), status: v.string(), url: v.string(), description: v.string() }),
        v.object({ ...TicketReferenceSchema.entries, unavailable: v.string() }),
      ]),
    ),
  }),
  figma: v.object({
    frames: v.array(v.object({ url: v.string(), name: v.string(), outline: v.string(), image: v.nullable(v.string()) })),
    skipped: v.array(v.string()),
  }),
  functional: GrillOutcomeSchema,
  technical: GrillOutcomeSchema,
  scope: v.object({
    impacted: v.array(v.object({ repo: v.string(), level: v.number(), area: v.string(), evidence: v.array(v.string()) })),
    excluded: v.array(v.object({ repo: v.string(), reason: v.string() })),
  }),
  plan: PlanSchema,
  contradictions: v.array(ContradictionSchema),
});

const DeliveredSchema: v.GenericSchema<unknown, DeliveredRepo[]> = v.array(
  v.object({
    repo: v.string(),
    branch: v.string(),
    directory: v.string(),
    base: v.string(),
    baseBranch: v.string(),
    project: v.string(),
    commits: v.array(v.string()),
    release: v.nullable(v.object({ tag: v.string(), version: v.string() })),
    contradictions: v.array(ContradictionSchema),
  }),
);

const PublicationSchema: v.GenericSchema<unknown, Publication> = v.object({
  memory: v.object({
    operations: v.array(v.object({ action: v.string(), path: v.string(), why: v.string() })),
    commit: v.nullable(v.string()),
  }),
  mergeRequests: v.array(v.object({ repo: v.string(), project: v.string(), iid: v.number(), url: v.string() })),
  slack: v.object({ channel: v.object({ id: v.string(), name: v.string() }), invited: v.array(v.string()), unknown: v.array(v.string()) }),
  jira: v.object({ transition: v.nullable(v.string()), commented: v.boolean() }),
});

export const LedgerSchema = v.object({
  key: v.string(),
  squad: v.string(),
  title: v.string(),
  url: v.string(),
  startedAt: v.string(),
  updatedAt: v.string(),
  notes: v.nullable(v.string()),
  figmaOverrides: v.array(v.string()),
  budgets: SettingsSchema.entries.budgets,
  phase: v.picklist(PHASES),
  resumePhase: v.nullable(v.picklist(["framing", "delivery", "closing"])),
  framing: v.object({
    attempt: v.number(),
    reopen: v.array(v.object({ target: v.picklist(REOPEN_TARGETS), note: v.string(), at: v.string() })),
  }),
  approved: v.nullable(json),
  delivered: v.nullable(json),
  delivery: v.object({ generation: v.number(), seeds: v.record(v.string(), v.string()) }),
  closing: v.object({ attempt: v.number() }),
  active: v.nullable(v.object({ runId: v.string(), pid: v.number() })),
  escalation: v.nullable(v.object({ kind: v.picklist(ESCALATION_KINDS), task: v.string(), detail: v.string(), at: v.string() })),
  publication: v.nullable(json),
  history: v.array(v.object({ at: v.string(), event: v.string() })),
  /** Tokens spent by each workflow run of the ticket, by run id: a rerun of the same run id replaces its entry. */
  usage: v.optional(v.record(v.string(), TokensSchema), {}),
});

export type Ledger = v.InferOutput<typeof LedgerSchema>;
export type Phase = Ledger["phase"];

export function readLedger(paths: Paths, key: string): Ledger | null {
  const file = ticketFile(paths, key);
  if (!existsSync(file)) return null;
  const result = v.safeParse(LedgerSchema, parse(readFileSync(file, "utf8")));
  if (!result.success) fail(`Ledger illisible : ${file}.`, result.issues.map((issue) => `${v.getDotPath(issue)} : ${issue.message}`).join("\n"));
  return result.output;
}

/**
 * What one phase hands the next is checked when read, not in readLedger: a run written by an
 * incompatible redline stops at the phase that needs it, and clear still reads the rest.
 */
export function approvedOf(ledger: Ledger): FramingOutcome {
  return handover(ledger, "approved", FramingOutcomeSchema);
}

export function deliveredOf(ledger: Ledger): DeliveredRepo[] {
  return handover(ledger, "delivered", DeliveredSchema);
}

export function publicationOf(ledger: Ledger): Publication {
  return handover(ledger, "publication", PublicationSchema);
}

function handover<T>(ledger: Ledger, field: "approved" | "delivered" | "publication", schema: v.GenericSchema<unknown, T>): T {
  const result = v.safeParse(schema, ledger[field]);
  if (!result.success) fail(`Ledger illisible : ${ledger.key}, champ ${field}.`, result.issues.map((issue) => `${v.getDotPath(issue) ?? field} : ${issue.message}`).join("\n"));
  return result.output;
}

export function writeLedger(paths: Paths, ledger: Ledger): Ledger {
  const stamped = { ...ledger, updatedAt: new Date().toISOString() };
  writeYamlAtomic(ticketFile(paths, ledger.key), stamped);
  return stamped;
}

export function updateLedger(paths: Paths, key: string, change: (ledger: Ledger) => Ledger): Ledger {
  const current = readLedger(paths, key) ?? fail(`Aucun run pour ${key}.`, `Lance d'abord : bun redline start ${key}`);
  return writeLedger(paths, change(current));
}

/** The outpost run id of a phase's current attempt: its checkpoint is stored under it. */
export function runIdOf(ledger: Ledger, phase: "framing" | "delivery" | "closing"): string {
  const attempt = phase === "framing" ? ledger.framing.attempt : phase === "delivery" ? ledger.delivery.generation : ledger.closing.attempt;
  return `${ledger.key}/${phase}/${attempt}`;
}

export function recordEvent(ledger: Ledger, event: string): Ledger {
  return { ...ledger, history: [...ledger.history, { at: new Date().toISOString(), event }] };
}

export function newLedger(input: Pick<Ledger, "key" | "squad" | "title" | "url" | "notes" | "figmaOverrides" | "budgets">): Ledger {
  const now = new Date().toISOString();
  return {
    ...input,
    startedAt: now,
    updatedAt: now,
    phase: "framing",
    resumePhase: null,
    framing: { attempt: 1, reopen: [] },
    approved: null,
    delivered: null,
    delivery: { generation: 1, seeds: {} },
    closing: { attempt: 1 },
    active: null,
    escalation: null,
    publication: null,
    history: [{ at: now, event: "run ouvert" }],
    usage: {},
  };
}
