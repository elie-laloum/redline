import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import redline from "../../package.json" with { type: "json" };
import { PROMPTS } from "../agents/role.ts";
import { digest } from "../domain/digest.ts";
import { ROLE_NAMES, type RoleName } from "../domain/roles.ts";

const CACHE_EPOCH = "1";

export function promptDigest(roles: readonly RoleName[]): string {
  return digest([CACHE_EPOCH, ...roles.map((role) => readFileSync(join(PROMPTS, `${role}.md`), "utf8"))]);
}

export function outpostVersion(): string {
  const entry = fileURLToPath(import.meta.resolve("@elie-laloum/outpost"));
  return (JSON.parse(readFileSync(join(dirname(entry), "..", "package.json"), "utf8")) as { version: string }).version;
}

export function checkpointVersion(): string {
  return digest([redline.version, outpostVersion(), promptDigest(ROLE_NAMES)]);
}
