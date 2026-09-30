export class RedlineError extends Error {
  readonly hint: string | null;

  constructor(message: string, hint: string | null = null) {
    super(message);
    this.name = "RedlineError";
    this.hint = hint;
  }
}

export function fail(message: string, hint?: string): never {
  throw new RedlineError(message, hint ?? null);
}

const STDERR_TAIL = 800;

/** Message, hint, stderr captured by outpost and cause: everything that names the actual failure. */
export function describeError(error: unknown): string {
  if (!(error instanceof Error)) return String(error);
  const parts = [error.message];
  if (error instanceof RedlineError && error.hint) parts.push(error.hint);
  const stderr = stderrOf(error);
  if (stderr) parts.push(stderr);
  if (error.cause instanceof Error || typeof error.cause === "string") parts.push(describeError(error.cause));
  return parts.filter((part, index) => part && parts.indexOf(part) === index).join("\n");
}

function stderrOf(error: Error): string | null {
  const details = (error as { details?: { stderr?: unknown } }).details;
  const stderr = details?.stderr === undefined || details.stderr === null ? "" : String(details.stderr).trim();
  if (!stderr) return null;
  return stderr.length > STDERR_TAIL ? `…${stderr.slice(-STDERR_TAIL)}` : stderr;
}
