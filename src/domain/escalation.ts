export const ESCALATION_KINDS = ["convergence", "environment", "arbitrage"] as const;
export type EscalationKind = (typeof ESCALATION_KINDS)[number];

export interface EscalationRecord {
  readonly kind: EscalationKind;
  readonly task: string;
  readonly detail: string;
  readonly at: string;
}

const SERIALIZED = /^\[(convergence|environment|arbitrage)\] ([^:]+): ([\s\S]*)$/;

export function serializeEscalation(kind: EscalationKind, task: string, detail: string): string {
  return `[${kind}] ${task}: ${detail}`;
}

export function parseEscalation(message: string, at = new Date().toISOString()): EscalationRecord | null {
  const match = SERIALIZED.exec(message.replace(/^[\s\S]*?(?=\[(?:convergence|environment|arbitrage)\] )/, ""));
  if (!match?.[1] || !match[2] || match[3] === undefined) return null;
  return { kind: match[1] as EscalationKind, task: match[2], detail: match[3], at };
}

/** The history line a run records when it escalates; `earlierEscalations` reads it back. */
export function escalationEvent(kind: EscalationKind, task: string): string {
  return `escalade ${kind} sur ${task}`;
}

const RECORDED = /^escalade (convergence|environment|arbitrage) sur (.+)$/;

/** The task an escalation belongs to, without the gate a convergence names: `core.tests/adversaire` → `core.tests`. */
export function escalatedTask(task: string): string {
  return task.split("/")[0] ?? task;
}

/** The kinds of the escalations recorded on the same task before the latest one, oldest first. */
export function earlierEscalations(history: readonly { readonly event: string }[], task: string): EscalationKind[] {
  const root = escalatedTask(task);
  const kinds = history.flatMap((entry) => {
    const match = RECORDED.exec(entry.event);
    return match?.[1] && match[2] && escalatedTask(match[2]) === root ? [match[1] as EscalationKind] : [];
  });
  return kinds.slice(0, -1);
}
