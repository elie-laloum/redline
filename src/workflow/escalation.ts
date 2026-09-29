import { type EscalationKind, serializeEscalation } from "../domain/escalation.ts";

export class Escalation extends Error {
  readonly kind: EscalationKind;
  readonly task: string;
  readonly detail: string;

  constructor(kind: EscalationKind, task: string, detail: string) {
    super(serializeEscalation(kind, task, detail));
    this.name = "Escalation";
    this.kind = kind;
    this.task = task;
    this.detail = detail;
  }
}
