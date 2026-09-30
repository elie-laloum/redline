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
