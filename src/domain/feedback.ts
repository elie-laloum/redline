import type { CheckResult } from "../ports/checks.ts";

export interface LineVerdictLike {
  readonly id: string;
  readonly verdict: "passe" | "manque";
  readonly evidence: string;
  readonly comment: string;
}

export function failingLines(lines: readonly LineVerdictLike[]): LineVerdictLike[] {
  return lines.filter((line) => line.verdict === "manque");
}

export function renderVerdicts(lines: readonly LineVerdictLike[]): string {
  return lines.map((line) => `- ${line.id} ${line.verdict.toUpperCase()} — ${line.evidence}${line.comment ? ` : ${line.comment}` : ""}`).join("\n");
}

export function renderCheck(result: CheckResult): string {
  const header = `\`${result.command}\` a echoue (code ${result.exitCode}${result.stopReason ? `, ${result.stopReason}` : ""}).`;
  const report = result.report
    ? `Rapport (${result.report.from.join(", ")}), ${result.report.total} diagnostic(s) :\n${result.report.diagnostics.map((d) => `- ${d.file}${d.line ? `:${d.line}` : ""} ${d.rule} — ${d.message}`).join("\n")}`
    : "";
  const output = [result.stdout.trim(), result.stderr.trim()].filter(Boolean).join("\n");
  const log = result.logPath ? `Journal complet : ${result.logPath}` : "";
  return [header, report, output ? `\`\`\`\n${output}\n\`\`\`` : "", log].filter(Boolean).join("\n\n");
}
