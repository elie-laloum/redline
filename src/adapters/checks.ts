import { globSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";
import { type CommandKind, commandFor, type RepoEntry, reportPathFor, targetingFor } from "../domain/config.ts";
import { type Diagnostic, parseCodeClimate } from "../domain/reports.ts";
import { renderTargeting } from "../domain/targeting.ts";
import type { CheckReport, CheckResult, CheckRunner } from "../ports/checks.ts";
import { run, stopReason } from "./exec.ts";

export interface CheckRunnerOptions {
  readonly commandSeconds: number;
  readonly silenceSeconds: number;
  readonly logDirectory: string;
}

const MAX_DIAGNOSTICS = 60;

export function createCheckRunner(options: CheckRunnerOptions): CheckRunner {
  return {
    async run(repo, kind, directory, check = {}) {
      const command = commandFor(repo, kind);
      if (!command) return skipped(kind);
      const template = targetingFor(repo, kind);
      const paths = check.paths ?? [];
      const targeted = template !== null && paths.length > 0;
      const focus = check.focus ?? (!targeted && paths.length > 0 ? paths.map((path) => escape(basename(path))).join("|") : undefined);
      const full = [command, check.filter, targeted ? renderTargeting(template, paths) : ""].filter(Boolean).join(" ");
      const result = await run(full, {
        cwd: directory,
        timeoutMs: options.commandSeconds * 1000,
        silenceMs: options.silenceSeconds * 1000,
        focus,
        log: { directory: options.logDirectory, label: check.label ?? `${repo.name}-${kind}` },
        signal: check.signal,
      });
      const passed = result.exitCode === 0;
      return {
        kind,
        ran: true,
        command: full,
        targeted,
        passed,
        exitCode: result.exitCode,
        stoppedBy: result.stoppedBy,
        stopReason: stopReason(result),
        durationMs: result.durationMs,
        stdout: result.stdout,
        stderr: result.stderr,
        truncated: result.truncated,
        logPath: result.logPath,
        focusMatched: result.focusMatched,
        report: passed ? null : readReport(repo, kind, directory),
      };
    },
  };
}

function skipped(kind: CommandKind): CheckResult {
  return {
    kind,
    ran: false,
    command: null,
    targeted: false,
    passed: true,
    exitCode: 0,
    stoppedBy: "exit",
    stopReason: null,
    durationMs: 0,
    stdout: "",
    stderr: "",
    truncated: false,
    logPath: null,
    focusMatched: null,
    report: null,
  };
}

export function readReport(repo: RepoEntry, kind: CommandKind, directory: string): CheckReport | null {
  const pattern = reportPathFor(repo, kind);
  if (!pattern) return null;
  let files: string[];
  try {
    files = globSync(pattern, { cwd: directory }).sort();
  } catch {
    return null;
  }
  const from: string[] = [];
  const diagnostics: Diagnostic[] = [];
  for (const file of files) {
    let parsed: Diagnostic[] | null = null;
    try {
      parsed = parseCodeClimate(readFileSync(join(directory, file), "utf8"));
    } catch {
      parsed = null;
    }
    if (!parsed) continue;
    from.push(file);
    diagnostics.push(...parsed);
  }
  return from.length === 0 ? null : { from, total: diagnostics.length, diagnostics: diagnostics.slice(0, MAX_DIAGNOSTICS) };
}

function escape(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
