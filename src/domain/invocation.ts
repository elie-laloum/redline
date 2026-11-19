/**
 * How the human runs redline, for the commands its messages suggest: `bun redline` from a clone,
 * where the package script runs it, `redline` once installed — the binary is a bun script already,
 * and `bun redline` there fails with `Script not found`.
 */
export function invocation(env: Readonly<Record<string, string | undefined>> = process.env): string {
  return env.npm_lifecycle_event === "redline" ? "bun redline" : "redline";
}

export const REDLINE = invocation();
