import * as v from "valibot";
import { frontmatterProblems, type Frontmatter, lengthProblem, type Note, SCOPES } from "./memory.ts";

const text = v.pipe(v.string(), v.trim(), v.minLength(1));

export const FrontmatterSchema = v.looseObject({
  type: text,
  scope: v.picklist(SCOPES),
  feature: v.optional(v.nullable(v.string())),
  last_verified: v.pipe(v.string(), v.regex(/^\d{4}-\d{2}-\d{2}$/)),
  repos: v.optional(v.array(v.string())),
  source: v.optional(v.object({ ticket: v.optional(v.nullable(v.string())), figma: v.optional(v.nullable(v.string())) })),
});

export const MemoryOpSchema = v.variant("action", [
  v.object({ action: v.literal("create"), path: text, frontmatter: FrontmatterSchema, body: text, why: text }),
  v.object({ action: v.literal("update"), path: text, frontmatter: FrontmatterSchema, body: text, why: text }),
  v.object({ action: v.literal("delete"), path: text, why: text }),
]);

export const ContradictionDecisionSchema = v.object({
  note: text,
  decision: v.picklist(["corriger", "reecrire", "supprimer", "garder"]),
  why: text,
});

export type MemoryOp = v.InferOutput<typeof MemoryOpSchema>;
export type ContradictionDecision = v.InferOutput<typeof ContradictionDecisionSchema>;

export function memoryOpProblems(ops: readonly MemoryOp[], notes: readonly Note[], maxNoteLines: number, contradicted: readonly string[], decisions: readonly ContradictionDecision[]): string[] {
  const problems: string[] = [];
  const existing = new Set(notes.map((note) => note.path));
  const touched = ops.map((op) => op.path);
  for (const path of new Set(touched.filter((path, index) => touched.indexOf(path) !== index))) problems.push(`${path} : plusieurs operations sur la meme note`);
  for (const op of ops) {
    if (op.action === "create" && existing.has(op.path)) problems.push(`${op.path} existe deja : utilise update`);
    if (op.action !== "create" && !existing.has(op.path)) problems.push(`${op.path} n'existe pas : utilise create`);
    if (op.action === "delete") continue;
    problems.push(...frontmatterProblems(op.path, op.frontmatter as Frontmatter).map((problem) => `${op.path} : ${problem}`));
    const length = lengthProblem(op.body, maxNoteLines);
    if (length) problems.push(`${op.path} : ${length}`);
  }
  for (const note of new Set(contradicted)) {
    if (!decisions.some((decision) => decision.note === note)) problems.push(`la contradiction sur ${note} n'a pas de decision`);
  }
  return problems;
}
