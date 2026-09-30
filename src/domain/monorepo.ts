import type { RepoEntry } from "./config.ts";

export function filterFlags(monorepoTool: RepoEntry["monorepoTool"], packages: readonly string[]): string {
  if (!monorepoTool || packages.length === 0) return "";
  const flag = monorepoTool === "turbo" ? "--filter" : "--scope";
  return packages.map((name) => `${flag}=${name}`).join(" ");
}

export function installCommand(packageManager: RepoEntry["packageManager"]): string {
  switch (packageManager) {
    case "pnpm":
      return "pnpm install --frozen-lockfile";
    case "yarn":
      return "yarn install --frozen-lockfile";
    case "bun":
      return "bun install --frozen-lockfile";
    default:
      return "npm ci";
  }
}
