import { existsSync } from "node:fs";
import { type CommandKind, findRepo, loadConfig } from "../lib/config.ts";
import { fail } from "../lib/errors.ts";
import { run } from "../lib/exec.ts";
import { worktreePath } from "../lib/paths.ts";
import { arr, obj, str } from "../lib/schema.ts";
import { type AnyTool, defineTool } from "../lib/tool.ts";

/**
 * Lancer une commande et lire un code de sortie n'a jamais demande un LLM.
 * Ces tools rendent un verdict brut ; ce qu'on paie un modele pour faire, c'est
 * interpreter un echec et le router, jamais lire un `exit 1`.
 */

const KINDS: { kind: CommandKind; tool: string; label: string }[] = [
  { kind: "ut", tool: "run-test-ut", label: "tests unitaires" },
  { kind: "it", tool: "run-test-it", label: "tests d'integration" },
  { kind: "ft", tool: "run-test-ft", label: "tests fonctionnels" },
  { kind: "ct", tool: "run-test-ct", label: "tests de composant" },
  { kind: "e2e", tool: "run-test-e2e", label: "tests de bout en bout" },
  { kind: "lint", tool: "run-lint", label: "lint" },
  { kind: "typecheck", tool: "run-typecheck", label: "typecheck" },
];

export const qualityTools: AnyTool[] = KINDS.map(({ kind, tool, label }) =>
  defineTool({
    name: tool,
    description:
      `Lance les ${label} d'un repo. La commande n'est jamais deduite du runner : elle est lue dans repositories.yaml. ` +
      `Si le repo ne declare pas ce type de verification, le tool le dit au lieu d'inventer une commande.`,
    inputSchema: obj(
      {
        ticketId: str("Cle Jira, elle designe le worktree."),
        repo: str("Nom du repo dans le registre."),
        filter: str("Drapeaux de filtre monorepo, tels que rendus par monorepo-filter."),
        paths: arr("Fichiers ou motifs a cibler, quand le runner le permet.", str("Chemin ou motif.")),
      },
      ["ticketId", "repo"],
    ),
    handler: async (input: { ticketId: string; repo: string; filter?: string; paths?: string[] }) => {
      const repo = findRepo(input.repo);
      const command = repo.commands?.[kind] ?? null;

      if (!command) {
        return {
          ran: false,
          repo: repo.name,
          kind,
          reason: `Le repo ${repo.name} ne declare pas de commande \`${kind}\`.`,
          note: "Ce n'est pas un echec : ce type de verification n'existe pas ici. N'en invente pas une.",
        };
      }

      const cwd = worktreePath(input.ticketId, repo.name);
      if (!existsSync(cwd)) fail(`Worktree absent : ${cwd}.`, "Appelle create-worktree puis setup-repo.");

      const full = [command, input.filter, ...(input.paths ?? [])].filter(Boolean).join(" ");
      const result = await run(full, { cwd, timeoutMs: loadConfig().timeouts.commandSeconds * 1000 });

      return {
        ran: true,
        repo: repo.name,
        kind,
        command: full,
        passed: result.exitCode === 0,
        exitCode: result.exitCode,
        timedOut: result.timedOut,
        durationMs: result.durationMs,
        stdout: result.stdout,
        stderr: result.stderr,
        truncated: result.truncated,
      };
    },
  }),
);
