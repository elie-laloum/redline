import { existsSync, mkdirSync, rmSync } from "node:fs";
import { dirname } from "node:path";
import { findRepo, loadConfig, repoRoot } from "../lib/config.ts";
import { fail } from "../lib/errors.ts";
import { run } from "../lib/exec.ts";
import {
  changedFiles,
  filterFlags,
  git,
  gitAllowFailure,
  headSha,
  installCommand,
  listTags,
  packagesOf,
} from "../lib/git.ts";
import { branchName, slugify } from "../lib/naming.ts";
import { worktreePath } from "../lib/paths.ts";
import { arr, bool, enumOf, obj, str } from "../lib/schema.ts";
import { type AnyTool, defineTool } from "../lib/tool.ts";

/**
 * Un fichier de test se reconnait a son chemin ou a son extension. Le
 * `developer` n'en ecrit jamais, et cette regle merite mieux qu'une phrase dans
 * un prompt : elle est verifiee ici, au moment du commit, ou elle est
 * verifiable.
 */
const TEST_FILE =
  /(^|\/)(?:tests?|__tests__|spec|e2e|cypress)\/|\.(?:test|spec)\.[cm]?[jt]sx?$|\.stories\.[cm]?[jt]sx?$/i;

export function isTestFile(path: string): boolean {
  return TEST_FILE.test(path);
}

export const gitTools: AnyTool[] = [
  defineTool({
    name: "create-worktree",
    description:
      "Cree le worktree git du ticket pour un repo, sur une branche neuve issue de la branche de base du registre. Rend le chemin du worktree. Idempotent : un worktree deja present est reutilise, pas recree.",
    inputSchema: obj(
      {
        ticketId: str("Cle Jira."),
        repo: str("Nom du repo dans le registre."),
        branch: str("Nom de branche. Omis, il est genere depuis la convention."),
        type: str("Type de branche quand elle est generee : feature, bugfix, ..."),
        title: str("Titre du ticket, pour le slug de la branche generee."),
      },
      ["ticketId", "repo"],
    ),
    handler: async (input: { ticketId: string; repo: string; branch?: string; type?: string; title?: string }) => {
      const repo = findRepo(input.repo);
      const source = repoRoot(repo);
      if (!existsSync(source)) {
        fail(`Repo absent du disque : ${source}.`, `Clone ${repo.gitlabProject} a cet emplacement, ou corrige le registre.`);
      }

      const branch =
        input.branch ??
        branchName({ type: input.type ?? "task", ticket: input.ticketId, titre: input.title ?? input.ticketId });
      const path = worktreePath(input.ticketId, repo.name);

      if (existsSync(path)) {
        return { worktree: path, branch: await currentBranchOf(path), repo: repo.name, created: false };
      }

      mkdirSync(dirname(path), { recursive: true });
      await git(source, ["fetch", "origin", repo.baseBranch, "--quiet"]).catch(() => "");

      const base = (await gitAllowFailure(source, ["rev-parse", "--verify", `origin/${repo.baseBranch}`])).ok
        ? `origin/${repo.baseBranch}`
        : repo.baseBranch;

      const existing = await gitAllowFailure(source, ["rev-parse", "--verify", branch]);
      await git(source, existing.ok ? ["worktree", "add", path, branch] : ["worktree", "add", "-b", branch, path, base]);

      return { worktree: path, branch, base, repo: repo.name, created: true };
    },
  }),

  defineTool({
    name: "setup-repo",
    description:
      "Installe les dependances d'un worktree selon le packageManager du registre. A appeler une fois par repo, avant le premier test : sans lui, le red-checker prendra une erreur d'import pour un echec de test.",
    inputSchema: obj({ ticketId: str("Cle Jira."), repo: str("Nom du repo.") }, ["ticketId", "repo"]),
    handler: async ({ ticketId, repo: name }: { ticketId: string; repo: string }) => {
      const repo = findRepo(name);
      const cwd = worktreePath(ticketId, repo.name);
      if (!existsSync(cwd)) fail(`Worktree absent : ${cwd}.`, "Appelle create-worktree d'abord.");

      const command = installCommand(repo);
      const result = await run(command, { cwd, timeoutMs: loadConfig().timeouts.repoSetupSeconds * 1000 });
      if (result.exitCode !== 0) {
        fail(
          `Installation des dependances en echec dans ${repo.name} (code ${result.exitCode}).`,
          (result.stderr || result.stdout).slice(-1500),
        );
      }
      return { repo: repo.name, command, durationMs: result.durationMs, ready: true };
    },
  }),

  defineTool({
    name: "remove-worktree",
    description:
      "Supprime le worktree d'un repo apres finalisation. A n'appeler qu'une fois la MR creee : tant que le run n'est pas publie, le worktree porte le seul exemplaire du travail.",
    inputSchema: obj(
      { ticketId: str("Cle Jira."), repo: str("Nom du repo."), force: bool("Supprimer meme si le worktree est sale.") },
      ["ticketId", "repo"],
    ),
    handler: async ({ ticketId, repo: name, force }: { ticketId: string; repo: string; force?: boolean }) => {
      const repo = findRepo(name);
      const path = worktreePath(ticketId, repo.name);
      if (!existsSync(path)) return { removed: false, reason: "Worktree deja absent." };

      const dirty = (await git(path, ["status", "--porcelain"])) !== "";
      if (dirty && !force) {
        fail(`Worktree sale : ${path}.`, "Commite ou passe `force: true` si la perte est assumee.");
      }
      const source = repoRoot(repo);
      await gitAllowFailure(source, ["worktree", "remove", path, ...(force ? ["--force"] : [])]);
      if (existsSync(path)) rmSync(path, { recursive: true, force: true });
      await gitAllowFailure(source, ["worktree", "prune"]);
      return { removed: true, path };
    },
  }),

  defineTool({
    name: "generate-branch-name",
    description:
      "Construit un nom de branche selon la convention d'autopilot.yaml. Le type choisi ici reste le meme pour la branche et pour la MR du repo.",
    inputSchema: obj(
      {
        // Les types vivent dans autopilot.yaml et sont valides a l'appel : les
        // figer ici obligerait a charger la configuration au chargement du
        // module, et un fichier absent casserait le serveur entier.
        type: str("Type de branche, parmi naming.types d'autopilot.yaml : feature, bugfix, hotfix, documentation, chore, refactor, test, style, task."),
        ticketId: str("Cle Jira."),
        title: str("Titre du ticket, transforme en slug."),
      },
      ["type", "ticketId", "title"],
    ),
    handler: ({ type, ticketId, title }: { type: string; ticketId: string; title: string }) => ({
      branch: branchName({ type, ticket: ticketId, titre: title }),
      slug: slugify(title),
      type,
    }),
  }),

  defineTool({
    name: "generate-commit-message",
    description:
      "Formate un message de commit en conventional commits, et refuse ce qui ne tient pas la convention. Le sujet est en anglais, a l'imperatif, sans point final.",
    inputSchema: obj(
      {
        type: enumOf("Type conventional commit.", [
          "feat",
          "fix",
          "refactor",
          "test",
          "docs",
          "chore",
          "style",
          "perf",
          "build",
          "ci",
        ]),
        subject: str("Sujet en anglais, imperatif, sans majuscule initiale ni point final."),
        scope: str("Portee, souvent le paquet ou le module touche."),
        body: str("Corps facultatif : le pourquoi, pas le quoi."),
        ticketId: str("Cle Jira, ajoutee en pied de message."),
      },
      ["type", "subject"],
    ),
    handler: (input: { type: string; subject: string; scope?: string; body?: string; ticketId?: string }) => {
      const subject = input.subject.trim().replace(/\.$/, "");
      if (!subject) fail("Sujet de commit vide.");
      const header = `${input.type}${input.scope ? `(${input.scope})` : ""}: ${subject}`;
      if (header.length > 72) {
        fail(`En-tete de commit trop long : ${header.length} caracteres, la limite est 72.`, header);
      }
      const parts = [header];
      if (input.body?.trim()) parts.push("", input.body.trim());
      if (input.ticketId) parts.push("", `Refs: ${input.ticketId}`);
      return { message: parts.join("\n"), header };
    },
  }),

  defineTool({
    name: "create-commit",
    description:
      "Commit atomique dans le worktree. A appeler APRES CHAQUE modification : un crash en cours de repo ne doit jamais faire perdre le travail deja fait. Le role declare est verifie — un developer qui tente de commiter un fichier de test est refuse.",
    inputSchema: obj(
      {
        ticketId: str("Cle Jira."),
        repo: str("Nom du repo."),
        message: str("Message complet, tel que rendu par generate-commit-message."),
        paths: arr("Fichiers a inclure. Omis, tout ce qui est modifie est commite.", str("Chemin relatif au worktree.")),
        role: enumOf("Qui commite. Determine la zone d'ecriture autorisee.", ["developer", "test-writer", "orchestrator"]),
      },
      ["ticketId", "repo", "message", "role"],
    ),
    handler: async (input: {
      ticketId: string;
      repo: string;
      message: string;
      paths?: string[];
      role: "developer" | "test-writer" | "orchestrator";
    }) => {
      const repo = findRepo(input.repo);
      const cwd = worktreePath(input.ticketId, repo.name);
      if (!existsSync(cwd)) fail(`Worktree absent : ${cwd}.`);

      await git(cwd, input.paths?.length ? ["add", "--", ...input.paths] : ["add", "-A"]);
      const staged = (await git(cwd, ["diff", "--cached", "--name-only"])).split("\n").filter(Boolean);
      if (staged.length === 0) return { committed: false, reason: "Rien a commiter." };

      const violations = checkZone(input.role, staged);
      if (violations.length > 0) {
        await gitAllowFailure(cwd, ["reset"]);
        fail(
          `Le role ${input.role} n'ecrit pas dans cette zone : ${violations.join(", ")}.`,
          input.role === "developer"
            ? "Le developer ne touche jamais un test. Remonte une zone non couverte ou un test conteste a l'orchestrateur."
            : "Le test-writer n'ecrit que des fichiers de test.",
        );
      }

      await git(cwd, [
        "-c",
        "user.name=l'utilisateur",
        "-c",
        "user.email=pro@elielaloum.com",
        "commit",
        "-m",
        input.message,
      ]);
      const sha = await headSha(cwd);
      return { committed: true, commitSha: sha, files: staged, repo: repo.name };
    },
  }),

  defineTool({
    name: "push-branch",
    description:
      "Pousse la branche du worktree sur le remote. Reserve au finalizer : avant le point 13, la seule ecriture distante autorisee est le tag de publication amont.",
    inputSchema: obj({ ticketId: str("Cle Jira."), repo: str("Nom du repo.") }, ["ticketId", "repo"]),
    handler: async ({ ticketId, repo: name }: { ticketId: string; repo: string }) => {
      const repo = findRepo(name);
      const cwd = worktreePath(ticketId, repo.name);
      if (!existsSync(cwd)) fail(`Worktree absent : ${cwd}.`);
      const branch = await currentBranchOf(cwd);
      await git(cwd, ["push", "--force-with-lease", "--set-upstream", "origin", branch], 300_000);
      return { pushed: true, branch, repo: repo.name, sha: await headSha(cwd) };
    },
  }),

  defineTool({
    name: "push-tag",
    description:
      "Pousse UNIQUEMENT un tag, sans aucune ref de branche. C'est la seule ecriture distante autorisee avant le finalizer : un tag se pousse sans pousser de branche, donc sans creer de MR.",
    inputSchema: obj(
      {
        ticketId: str("Cle Jira."),
        repo: str("Nom du repo."),
        tag: str("Nom du tag, version de dev suffixee par le ticket et le numero de publication."),
        message: str("Message annote du tag."),
      },
      ["ticketId", "repo", "tag"],
    ),
    handler: async (input: { ticketId: string; repo: string; tag: string; message?: string }) => {
      const repo = findRepo(input.repo);
      const cwd = worktreePath(input.ticketId, repo.name);
      if (!existsSync(cwd)) fail(`Worktree absent : ${cwd}.`);

      const existing = await listTags(cwd);
      if (existing.includes(input.tag)) {
        fail(
          `Le tag ${input.tag} existe deja.`,
          "Republier la meme version, c'est un rejet du registre ou un cache qui sert l'ancien artefact. Incremente le suffixe.",
        );
      }

      await git(cwd, ["tag", "-a", input.tag, "-m", input.message ?? `${input.tag} (${input.ticketId})`]);
      // `refs/tags/<tag>` et rien d'autre : aucune branche ne part avec.
      await git(cwd, ["push", "origin", `refs/tags/${input.tag}`], 300_000);
      return { pushed: true, tag: input.tag, sha: await headSha(cwd), repo: repo.name };
    },
  }),

  defineTool({
    name: "monorepo-filter",
    description:
      "Deduit les paquets touches a partir des fichiers modifies, en remontant au package.json le plus proche, et rend les drapeaux de filtre du monorepoTool. Sert a cadrer les verifications et le perimetre d'impact d'une review.",
    inputSchema: obj(
      {
        ticketId: str("Cle Jira."),
        repo: str("Nom du repo."),
        files: arr("Fichiers a analyser. Omis, le diff avec la branche de base est utilise.", str("Chemin relatif.")),
      },
      ["ticketId", "repo"],
    ),
    handler: async (input: { ticketId: string; repo: string; files?: string[] }) => {
      const repo = findRepo(input.repo);
      const cwd = worktreePath(input.ticketId, repo.name);
      const files = input.files ?? (existsSync(cwd) ? await changedFiles(cwd, repo.baseBranch) : []);
      const packages = repo.monorepoTool ? packagesOf(cwd, files) : [];
      return {
        repo: repo.name,
        monorepoTool: repo.monorepoTool,
        files,
        packages,
        filter: filterFlags(repo, packages),
        note: repo.monorepoTool
          ? "Ajoute `filter` aux commandes du registre pour ne verifier que ce qui a bouge."
          : "Ce repo n'est pas un monorepo : les commandes du registre s'appliquent telles quelles.",
      };
    },
  }),
];

function checkZone(role: string, files: readonly string[]): string[] {
  if (role === "developer") return files.filter(isTestFile);
  if (role === "test-writer") return files.filter((file) => !isTestFile(file));
  return [];
}

async function currentBranchOf(cwd: string): Promise<string> {
  return git(cwd, ["rev-parse", "--abbrev-ref", "HEAD"]);
}
