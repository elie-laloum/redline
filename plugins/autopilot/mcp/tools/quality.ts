import { existsSync, globSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { type CommandKind, type RepoEntry, findRepo, loadConfig, reportPathFor } from "../lib/config.ts";
import { fail } from "../lib/errors.ts";
import { run, stopReason } from "../lib/exec.ts";
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
    handler: async (
      input: { ticketId: string; repo: string; filter?: string; paths?: string[] },
      context,
    ) => {
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

      const timeouts = loadConfig().timeouts;
      const full = [command, input.filter, ...(input.paths ?? [])].filter(Boolean).join(" ");
      const result = await run(full, {
        cwd,
        timeoutMs: timeouts.commandSeconds * 1000,
        silenceMs: timeouts.commandSilenceSeconds * 1000,
        // Un test long est legitime ; un appel MCP muet ne l'est pas. Le
        // battement porte la difference jusqu'au client, qui sinon tue l'appel
        // et laisse l'agent avec un timeout qu'il ne sait pas interpreter.
        onProgress: (message) => context.heartbeat(`${repo.name} ${kind} — ${message}`),
      });

      const report = result.exitCode === 0 ? null : readReport(repo, kind, cwd);

      return {
        ran: true,
        repo: repo.name,
        kind,
        command: full,
        passed: result.exitCode === 0,
        exitCode: result.exitCode,
        timedOut: result.timedOut,
        stoppedBy: result.stoppedBy,
        abandonedBecause: stopReason(result),
        durationMs: result.durationMs,
        stdout: result.stdout,
        stderr: result.stderr,
        truncated: result.truncated,
        ...(report ? { report } : {}),
      };
    },
  }),
);

interface Diagnostic {
  readonly file: string;
  readonly line: number | null;
  readonly severity: string;
  readonly rule: string;
  readonly message: string;
}

interface Report {
  readonly from: readonly string[];
  readonly total: number;
  readonly diagnostics: readonly Diagnostic[];
  readonly truncated: boolean;
  readonly note: string;
}

/** Au dela, on ne lit plus un rapport, on subit un dump. */
const MAX_DIAGNOSTICS = 60;

/**
 * Le diagnostic est dans un fichier, pas sur la sortie.
 *
 * Une commande de qualite redirige souvent son rapport — `biome ci
 * --reporter=gitlab > code-quality.json`. Le tool voit alors un `exit 1` et
 * zero ligne, et l'agent n'a plus que la lecture manuelle pour savoir ce qui a
 * casse : sur FT-1042, deux heures de run y sont passees avant que la session
 * soit tuee. Le registre dit ou le rapport atterrit ; on le lit ici.
 */
function readReport(repo: RepoEntry, kind: CommandKind, cwd: string): Report | null {
  const pattern = reportPathFor(repo, kind);
  if (!pattern) return null;

  let files: string[];
  try {
    files = globSync(pattern, { cwd }).sort();
  } catch {
    return null;
  }
  if (files.length === 0) return null;

  const diagnostics: Diagnostic[] = [];
  const read: string[] = [];
  for (const file of files) {
    const parsed = parseReport(join(cwd, file));
    if (!parsed) continue;
    read.push(file);
    diagnostics.push(...parsed);
  }
  if (read.length === 0) return null;

  const kept = diagnostics.slice(0, MAX_DIAGNOSTICS);
  return {
    from: read,
    total: diagnostics.length,
    diagnostics: kept,
    truncated: diagnostics.length > kept.length,
    note:
      `La commande ecrit son rapport dans ${pattern}, pas sur sa sortie. ` +
      "Ces lignes viennent du fichier : inutile de les rechercher a la main.",
  };
}

/**
 * Le format CodeClimate, celui que `--reporter=gitlab` produit et que GitLab
 * lit. On ne tente rien d'autre : un rapport qu'on ne reconnait pas est rendu
 * absent, pas devine.
 */
function parseReport(path: string): Diagnostic[] | null {
  let raw: string;
  try {
    raw = readFileSync(path, "utf8");
  } catch {
    return null;
  }
  if (!raw.trim()) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!Array.isArray(parsed)) return null;

  return parsed.flatMap((entry) => {
    if (typeof entry !== "object" || entry === null) return [];
    const item = entry as {
      description?: unknown;
      check_name?: unknown;
      severity?: unknown;
      location?: { path?: unknown; lines?: { begin?: unknown } };
    };
    return [
      {
        file: typeof item.location?.path === "string" ? item.location.path : "?",
        line: typeof item.location?.lines?.begin === "number" ? item.location.lines.begin : null,
        severity: typeof item.severity === "string" ? item.severity : "unknown",
        rule: typeof item.check_name === "string" ? item.check_name : "?",
        message: typeof item.description === "string" ? item.description : "",
      },
    ];
  });
}
