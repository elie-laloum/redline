import { existsSync, readFileSync } from "node:fs";
import * as v from "valibot";
import { parse } from "yaml";
import { writeYamlAtomic } from "../adapters/yaml.ts";
import { SettingsSchema } from "../domain/config.ts";
import { ESCALATION_KINDS } from "../domain/escalation.ts";
import { fail } from "../domain/failure.ts";
import { type Paths, ticketFile } from "./paths.ts";

export const PHASES = ["framing", "delivery", "closing", "done", "escalated"] as const;
export const REOPEN_TARGETS = ["functional", "technical", "plan"] as const;

const json = v.unknown();

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
  plan: v.nullable(json),
  delivery: v.object({ generation: v.number(), seeds: v.record(v.string(), v.string()) }),
  closing: v.object({ attempt: v.number() }),
  active: v.nullable(v.object({ runId: v.string(), pid: v.number() })),
  escalation: v.nullable(v.object({ kind: v.picklist(ESCALATION_KINDS), task: v.string(), detail: v.string(), at: v.string() })),
  publication: v.nullable(json),
  history: v.array(v.object({ at: v.string(), event: v.string() })),
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

export function writeLedger(paths: Paths, ledger: Ledger): Ledger {
  const stamped = { ...ledger, updatedAt: new Date().toISOString() };
  writeYamlAtomic(ticketFile(paths, ledger.key), stamped);
  return stamped;
}

export function updateLedger(paths: Paths, key: string, change: (ledger: Ledger) => Ledger): Ledger {
  const current = readLedger(paths, key) ?? fail(`Aucun run pour ${key}.`, `Lance d'abord : bun redline start ${key}`);
  return writeLedger(paths, change(current));
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
    plan: null,
    delivery: { generation: 1, seeds: {} },
    closing: { attempt: 1 },
    active: null,
    escalation: null,
    publication: null,
    history: [{ at: now, event: "run ouvert" }],
  };
}
