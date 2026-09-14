import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Sandbox } from "./harness.ts";

/**
 * Le cycle d'implementation d'un repo, reduit a sa sequence de tools.
 *
 * Ces tests verifient **l'enchainement**, pas le jugement des agents : un
 * workflow peut s'enchainer parfaitement avec un plan mediocre. La qualite du
 * jugement, c'est le role des evals — et c'est pour ca que les trois niveaux
 * coexistent.
 */

export interface CycleOptions {
  readonly ticketId: string;
  readonly repo: string;
  readonly type?: string;
  readonly title: string;
  /** Ce que le `test-writer` ecrit, puis ce que le `developer` ecrit. */
  readonly test?: { path: string; content: string };
  readonly code?: { path: string; content: string };
}

export async function openRepo(sandbox: Sandbox, options: CycleOptions): Promise<{ worktree: string; branch: string }> {
  const created = await sandbox.call<{ worktree: string; branch: string }>("create-worktree", {
    ticketId: options.ticketId,
    repo: options.repo,
    type: options.type ?? "feature",
    title: options.title,
  });
  await sandbox.call("setup-repo", { ticketId: options.ticketId, repo: options.repo });
  await sandbox.call("write-store-ticket", {
    ticketId: options.ticketId,
    patch: {
      run: { phase: "implementation", step: "10.1", currentRepo: options.repo },
      scope: [{ name: options.repo, status: "in-progress", worktree: created.worktree, branch: created.branch }],
    },
  });
  return created;
}

/** 10.1 — le test-writer ecrit un test, et rien d'autre. */
export async function writeTest(sandbox: Sandbox, options: CycleOptions & { worktree: string }): Promise<string> {
  if (!options.test) throw new Error("writeTest sans test");
  writeFileSync(join(options.worktree, options.test.path), options.test.content, "utf8");
  const { message } = await sandbox.call<{ message: string }>("generate-commit-message", {
    type: "test",
    subject: "cover the new behaviour",
    ticketId: options.ticketId,
  });
  const commit = await sandbox.call<{ commitSha: string }>("create-commit", {
    ticketId: options.ticketId,
    repo: options.repo,
    message,
    role: "test-writer",
  });
  return commit.commitSha;
}

/** 10.3 / 10.5 — on lance la suite et on rend le verdict brut. */
export async function runTests(sandbox: Sandbox, ticketId: string, repo: string): Promise<{ ran: boolean; passed: boolean; exitCode: number; stdout: string }> {
  const result = await sandbox.call<{ ran: boolean; passed?: boolean; exitCode?: number; stdout?: string; stderr?: string }>(
    "run-test-ut",
    { ticketId, repo },
  );
  return {
    ran: Boolean(result.ran),
    passed: Boolean(result.passed),
    exitCode: result.exitCode ?? -1,
    stdout: `${result.stdout ?? ""}${result.stderr ?? ""}`,
  };
}

/** 10.4 — le developer ecrit le code, et jamais un test. */
export async function writeCode(sandbox: Sandbox, options: CycleOptions & { worktree: string }): Promise<string> {
  if (!options.code) throw new Error("writeCode sans code");
  writeFileSync(join(options.worktree, options.code.path), options.code.content, "utf8");
  const { message } = await sandbox.call<{ message: string }>("generate-commit-message", {
    type: "feat",
    subject: "implement the new behaviour",
    ticketId: options.ticketId,
  });
  const commit = await sandbox.call<{ commitSha: string }>("create-commit", {
    ticketId: options.ticketId,
    repo: options.repo,
    message,
    role: "developer",
  });
  return commit.commitSha;
}

export async function closeRepo(sandbox: Sandbox, ticketId: string, repo: string): Promise<void> {
  await sandbox.call("write-store-ticket", {
    ticketId,
    patch: { run: { step: "10.7" }, scope: [{ name: repo, status: "done" }] },
  });
}

export function readFile(worktree: string, path: string): string {
  return readFileSync(join(worktree, path), "utf8");
}
