import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { fail } from "../domain/failure.ts";

export const SECRET_KEYS = [
  "JIRA_SITE_URL",
  "JIRA_EMAIL",
  "JIRA_API_TOKEN",
  "GITLAB_HOST",
  "GITLAB_TOKEN",
  "SLACK_USER_TOKEN",
  "FIGMA_TOKEN",
  "SLACK_API_BASE",
  "FIGMA_API_BASE",
  "CLAUDE_CODE_OAUTH_TOKEN",
  "ANTHROPIC_API_KEY",
] as const;
export type SecretKey = (typeof SECRET_KEYS)[number];

const OPTIONAL: readonly SecretKey[] = ["FIGMA_TOKEN", "GITLAB_HOST", "SLACK_API_BASE", "FIGMA_API_BASE"];
/** Required by one authentication mode only: check reports them with the agents' credentials. */
const AGENT_KEYS: readonly SecretKey[] = ["CLAUDE_CODE_OAUTH_TOKEN", "ANTHROPIC_API_KEY"];

export interface Secrets {
  get(key: SecretKey): string | null;
  require(key: SecretKey): string;
  describe(): { readonly key: SecretKey; readonly present: boolean; readonly required: boolean }[];
}

export function parseEnvFile(raw: string): Map<string, string> {
  const values = new Map<string, string>();
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    const eq = trimmed.indexOf("=");
    if (!trimmed || trimmed.startsWith("#") || eq <= 0) continue;
    let value = trimmed.slice(eq + 1).trim();
    if (/^(["']).*\1$/.test(value)) value = value.slice(1, -1);
    if (value) values.set(trimmed.slice(0, eq).trim(), value);
  }
  return values;
}

export function loadSecrets(file: string | null, env: Readonly<Record<string, string | undefined>> = process.env): Secrets {
  let values = new Map<string, string>();
  if (file) {
    try {
      values = parseEnvFile(readFileSync(file, "utf8"));
    } catch {
      values = new Map();
    }
  }
  for (const key of SECRET_KEYS) {
    const fromEnv = env[key];
    if (fromEnv) values.set(key, fromEnv);
  }
  return {
    get: (key) => values.get(key) ?? null,
    require: (key) => values.get(key) ?? fail(`Secret manquant : ${key}.`, `Renseigne-le dans ${file ?? "l'environnement"}, puis relance.`),
    describe: () => SECRET_KEYS.filter((key) => !AGENT_KEYS.includes(key)).map((key) => ({ key, present: values.has(key), required: !OPTIONAL.includes(key) })),
  };
}

/**
 * Sets one line of the .env, keeping every other line, and leaves the file readable by its owner
 * only. A line the template left commented out, `# KEY=`, takes the value in place.
 */
export function writeSecret(file: string, key: SecretKey, value: string): void {
  const lines = existsSync(file) ? readFileSync(file, "utf8").replace(/\n$/, "").split("\n") : [];
  const line = `${key}=${value}`;
  const set = lines.findIndex((existing) => existing.trim().startsWith(`${key}=`));
  const commented = lines.findIndex((existing) => new RegExp(`^#\\s*${key}=`).test(existing.trim()));
  const index = set >= 0 ? set : commented;
  if (index >= 0) lines[index] = line;
  else lines.push(line);
  mkdirSync(dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.tmp`;
  writeFileSync(temporary, `${lines.join("\n")}\n`, { encoding: "utf8", mode: 0o600 });
  chmodSync(temporary, 0o600);
  renameSync(temporary, file);
}
