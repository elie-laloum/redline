/**
 * Un tool qui echoue doit dire pourquoi en une phrase utilisable par un agent.
 * `ToolError` est la seule facon d'echouer proprement ; tout le reste remonte
 * comme une erreur interne et merite d'etre corrige plutot que rattrape.
 */
export class ToolError extends Error {
  readonly hint: string | null;

  constructor(message: string, hint: string | null = null) {
    super(message);
    this.name = "ToolError";
    this.hint = hint;
  }
}

export function fail(message: string, hint?: string): never {
  throw new ToolError(message, hint ?? null);
}
