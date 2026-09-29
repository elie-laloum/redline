import { existsSync, globSync } from "node:fs";
import { expandTilde } from "../../app/paths.ts";
import type { RepoEntry } from "../../domain/config.ts";
import type { ReaderSandbox } from "../../ports/sandboxes.ts";

const PATTERNS = [".claude/skills/*/SKILL.md", ".claude/rules/*.md", "CLAUDE.md", "AGENTS.md"];

export function conventionFiles(repo: RepoEntry): string[] {
  const root = expandTilde(repo.path);
  if (!existsSync(root)) return [];
  return PATTERNS.flatMap((pattern) => globSync(pattern, { cwd: root })).sort();
}

export function renderConventions(repos: readonly RepoEntry[], reader: Pick<ReaderSandbox, "repoPath">): string {
  return repos
    .map((repo) => {
      const files = conventionFiles(repo);
      const base = reader.repoPath(repo.name);
      return `### ${repo.name}\n${files.length ? files.map((file) => `- ${base}/${file}`).join("\n") : "(aucun fichier de convention)"}`;
    })
    .join("\n\n");
}
