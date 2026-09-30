import * as clack from "@clack/prompts";
import { createContext } from "../../app/context.ts";
import { diagnose, type Finding } from "../../app/diagnostics.ts";
import { mark } from "../output.ts";

export async function check(): Promise<number> {
  clack.intro("redline check");
  const spinner = clack.spinner();
  spinner.start("Verification de l'environnement");
  const findings = await diagnose(createContext());
  spinner.stop("Verification terminee");
  for (const [section, entries] of Map.groupBy(findings, (finding) => finding.section)) {
    clack.log.step(section);
    clack.log.message(entries.map(line).join("\n"));
  }
  const failed = findings.filter((finding) => finding.status === "fail").length;
  clack.outro(failed === 0 ? "Pret." : `${failed} point(s) bloquant(s).`);
  return failed === 0 ? 0 : 1;
}

function line(finding: Finding): string {
  return `${mark[finding.status]} ${finding.label} — ${finding.detail}`;
}
