import * as v from "valibot";
import { bullets, launchNotes } from "./render.ts";
import { defineRole } from "./role.ts";
import { text } from "./shared.ts";

export interface RedCheckerInput {
  readonly repo: string;
  readonly notes: string | null;
  readonly files: readonly string[];
  readonly command: string;
  readonly output: string;
}

export const redChecker = defineRole({
  name: "red-checker",
  tag: "rouge",
  schema: v.object({
    tests: v.array(v.object({ name: text, verdict: v.picklist(["bon-rouge", "mauvais-rouge", "vert"]), reason: text })),
    environment: v.object({ blocked: v.boolean(), reason: v.string() }),
  }),
  values: (input: RedCheckerInput) => ({
    REPO: input.repo,
    FILES: bullets(input.files),
    COMMAND: input.command,
    OUTPUT: input.output,
    NOTES: launchNotes(input.notes),
  }),
});
