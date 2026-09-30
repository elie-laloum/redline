import { execFile } from "node:child_process";
import { RedlineError } from "../domain/failure.ts";

export interface GitResult {
  readonly ok: boolean;
  readonly stdout: string;
  readonly stderr: string;
}

export function gitAllowFailure(cwd: string, args: readonly string[], timeoutMs = 120_000): Promise<GitResult> {
  return new Promise((resolve) => {
    execFile("git", [...args], { cwd, timeout: timeoutMs, maxBuffer: 64 * 1024 * 1024, env: { ...process.env, GIT_TERMINAL_PROMPT: "0" } }, (error, stdout, stderr) => {
      resolve({ ok: !error, stdout: stdout.toString().trim(), stderr: stderr.toString().trim() });
    });
  });
}

export async function git(cwd: string, args: readonly string[], timeoutMs?: number): Promise<string> {
  const result = await gitAllowFailure(cwd, args, timeoutMs);
  if (!result.ok) throw new RedlineError(`git ${args[0]} a echoue dans ${cwd}.`, (result.stderr || result.stdout).slice(0, 1200));
  return result.stdout;
}

export async function listTags(cwd: string): Promise<string[]> {
  return (await git(cwd, ["tag", "--list"])).split("\n").map((line) => line.trim()).filter(Boolean);
}

export async function workingChanges(cwd: string): Promise<string[]> {
  const tracked = await git(cwd, ["diff", "--name-only", "HEAD"]);
  const untracked = await git(cwd, ["ls-files", "--others", "--exclude-standard"]);
  return [...new Set([...tracked.split("\n"), ...untracked.split("\n")].filter(Boolean))].sort();
}

export async function changedFilesSince(cwd: string, base: string): Promise<string[]> {
  const committed = await git(cwd, ["diff", "--name-only", `${base}...HEAD`]);
  return [...new Set([...committed.split("\n").filter(Boolean), ...(await workingChanges(cwd))])].sort();
}

export function committerArgs(committer: { name: string; email: string } | undefined): string[] {
  return committer ? ["-c", `user.name=${committer.name}`, "-c", `user.email=${committer.email}`] : [];
}
