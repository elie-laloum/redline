import { functionalId } from "./derogation.ts";

/** `sans-objet`: the decision concerns another repository of the ticket, not this one. */
export const CONFORMITY_VERDICTS = ["conforme", "ecart", "sans-objet"] as const;
export type ConformityVerdict = (typeof CONFORMITY_VERDICTS)[number];

export interface ConformityGap {
  /** `F<n>` for a functional decision, `T<n>` or `C<n>` for a checklist line. */
  readonly id: string;
  readonly text: string;
  readonly evidence: string;
  readonly comment: string;
}

export interface ConformityReport {
  readonly repo: string;
  readonly gaps: readonly ConformityGap[];
}

interface Derogated {
  readonly question: string;
  readonly answer: string;
  readonly why: string;
  readonly overrides?: { readonly functional: string } | null | undefined;
}

/** Each functional arbitrage as it binds the delivered code: an accepted derogation replaces the arbitrage it departs from. */
export function bindingDecisions(functional: readonly Derogated[], technical: readonly Derogated[]): { id: string; text: string }[] {
  return functional.map((entry, index) => {
    const id = functionalId(index);
    const derogation = technical.find((candidate) => candidate.overrides?.functional === id);
    const decided = `${entry.question} → ${entry.answer} (${entry.why})`;
    return { id, text: derogation ? `${decided} — remplace par la derogation acceptee : ${derogation.question} → ${derogation.answer} (${derogation.why})` : decided };
  });
}

export function renderGap(gap: ConformityGap): string {
  const evidence = gap.evidence.trim() ? ` (${gap.evidence.trim()})` : "";
  return `${gap.id} ${gap.text} : ${gap.comment}${evidence}`;
}

export function gapCount(reports: readonly ConformityReport[]): number {
  return reports.reduce((total, report) => total + report.gaps.length, 0);
}
