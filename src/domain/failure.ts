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
