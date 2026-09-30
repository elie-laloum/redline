import type { CommandKind, RepoEntry } from "../domain/config.ts";
import type { Diagnostic } from "../domain/reports.ts";

export interface CommandObserver {
  start(command: string): void;
  progress(elapsedMs: number): void;
  end(outcome: { readonly elapsedMs: number; readonly exitCode: number; readonly passed: boolean; readonly logPath: string | null }): void;
}

export interface CheckOptions {
  readonly paths?: readonly string[];
  readonly focus?: string;
  readonly filter?: string;
  readonly signal?: AbortSignal;
  readonly label?: string;
  readonly observe?: CommandObserver;
}

export interface CheckReport {
  readonly from: readonly string[];
  readonly total: number;
  readonly diagnostics: readonly Diagnostic[];
}

export interface CheckResult {
  readonly kind: CommandKind;
  readonly ran: boolean;
  readonly command: string | null;
  readonly targeted: boolean;
  readonly passed: boolean;
  readonly exitCode: number;
  readonly stoppedBy: "exit" | "timeout" | "silence" | "abort";
  readonly stopReason: string | null;
  readonly durationMs: number;
  readonly maxSilentMs: number;
  readonly stdout: string;
  readonly stderr: string;
  readonly truncated: boolean;
  readonly logPath: string | null;
  readonly focusMatched: number | null;
  readonly report: CheckReport | null;
}

export interface CheckRunner {
  run(repo: RepoEntry, kind: CommandKind, directory: string, options?: CheckOptions): Promise<CheckResult>;
}
