import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fail } from "../domain/failure.ts";
import { type Frontmatter, frontmatterProblems, lengthProblem, type Note, parseNote, SCOPE_DIRECTORIES } from "../domain/memory.ts";
import { stringifyStrict } from "./yaml.ts";

export interface MemoryStore {
  readonly root: string;
  list(): Note[];
  read(path: string): Note | null;
  write(path: string, frontmatter: Frontmatter, body: string): void;
  remove(path: string): void;
  ensureLayout(): void;
}

export function serializeNote(frontmatter: Frontmatter, body: string): string {
  return `---\n${stringifyStrict(frontmatter).trimEnd()}\n---\n\n${body.trim()}\n`;
}

export function createMemoryStore(root: string, maxNoteLines: number): MemoryStore {
  const locate = (path: string) => {
    const absolute = resolve(root, path);
    if (relative(root, absolute).startsWith("..") || absolute === root || !absolute.endsWith(".md")) fail(`Chemin de note invalide : ${path}.`);
    return absolute;
  };

  return {
    root,

    list() {
      if (!existsSync(root)) return [];
      return [...walk(root)]
        .filter((file) => file.endsWith(".md"))
        .map((file) => parseNote(relative(root, file).split(sep).join("/"), readFileSync(file, "utf8")))
        .sort((a, b) => a.path.localeCompare(b.path));
    },

    read(path) {
      const absolute = locate(path);
      return existsSync(absolute) ? parseNote(path, readFileSync(absolute, "utf8")) : null;
    },

    write(path, frontmatter, body) {
      const problems = [...frontmatterProblems(path, frontmatter), lengthProblem(body, maxNoteLines)].filter((p): p is string => p !== null);
      if (problems.length > 0) fail(`Note refusee ${path} : ${problems.join(" ; ")}.`);
      const absolute = locate(path);
      mkdirSync(dirname(absolute), { recursive: true });
      writeFileSync(absolute, serializeNote(frontmatter, body), "utf8");
    },

    remove(path) {
      const absolute = locate(path);
      if (!existsSync(absolute)) fail(`Note introuvable : ${path}.`);
      rmSync(absolute);
    },

    ensureLayout() {
      for (const directory of Object.values(SCOPE_DIRECTORIES)) mkdirSync(join(root, directory), { recursive: true });
    },
  };
}

function* walk(directory: string): Generator<string> {
  for (const entry of readdirSync(directory)) {
    if (entry === ".git" || entry === "node_modules") continue;
    const absolute = join(directory, entry);
    if (statSync(absolute).isDirectory()) yield* walk(absolute);
    else yield absolute;
  }
}
