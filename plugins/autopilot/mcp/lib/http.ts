import { ToolError } from "./errors.ts";

export interface HttpOptions {
  readonly method?: "GET" | "POST" | "PUT" | "DELETE";
  readonly headers?: Readonly<Record<string, string>>;
  readonly body?: unknown;
  readonly timeoutMs?: number;
  readonly form?: Readonly<Record<string, string>>;
  /** Codes acceptes en plus de 2xx, quand l'absence est une reponse valable. */
  readonly allow?: readonly number[];
}

export interface HttpResponse<T> {
  readonly status: number;
  readonly data: T;
}

/**
 * Un seul client http pour les quatre services.
 *
 * Il ne reessaie que sur les pannes qui passent toutes seules — 429, 5xx,
 * coupure reseau. Reessayer un 400 ou un 403 ne repare rien et masque la cause
 * reelle derriere trois tentatives identiques.
 */
export async function request<T>(url: string, options: HttpOptions = {}): Promise<HttpResponse<T>> {
  const attempts = 3;
  let lastError: unknown = null;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(url, buildInit(options));
      const text = await response.text();
      const data = parseBody<T>(text, response.headers.get("content-type"));

      if (response.ok || options.allow?.includes(response.status)) {
        return { status: response.status, data };
      }
      if (isRetryable(response.status) && attempt < attempts) {
        await wait(backoffMs(attempt, response.headers.get("retry-after")));
        continue;
      }
      throw new ToolError(
        `${options.method ?? "GET"} ${redact(url)} a repondu ${response.status}.`,
        text.slice(0, 600) || null,
      );
    } catch (error) {
      if (error instanceof ToolError) throw error;
      lastError = error;
      if (attempt < attempts) {
        await wait(backoffMs(attempt, null));
        continue;
      }
    }
  }

  throw new ToolError(
    `${options.method ?? "GET"} ${redact(url)} injoignable apres ${attempts} tentatives.`,
    lastError instanceof Error ? lastError.message : null,
  );
}

function buildInit(options: HttpOptions): RequestInit {
  const headers: Record<string, string> = { accept: "application/json", ...options.headers };
  let body: string | undefined;

  if (options.form) {
    headers["content-type"] = "application/x-www-form-urlencoded; charset=utf-8";
    body = new URLSearchParams(options.form).toString();
  } else if (options.body !== undefined) {
    headers["content-type"] = "application/json; charset=utf-8";
    body = JSON.stringify(options.body);
  }

  return {
    method: options.method ?? "GET",
    headers,
    body,
    signal: AbortSignal.timeout(options.timeoutMs ?? 30_000),
  };
}

function parseBody<T>(text: string, contentType: string | null): T {
  if (!text) return null as T;
  if (contentType?.includes("json") || text.trimStart().startsWith("{") || text.trimStart().startsWith("[")) {
    try {
      return JSON.parse(text) as T;
    } catch {
      return text as T;
    }
  }
  return text as T;
}

function isRetryable(status: number): boolean {
  return status === 429 || status >= 500;
}

function backoffMs(attempt: number, retryAfter: string | null): number {
  const advertised = retryAfter ? Number(retryAfter) * 1000 : Number.NaN;
  if (Number.isFinite(advertised) && advertised > 0) return Math.min(advertised, 30_000);
  return 400 * 2 ** (attempt - 1);
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Une URL peut porter un jeton en query. Elle ne doit pas finir dans un message. */
export function redact(url: string): string {
  return url.replace(/([?&](token|access_token|private_token)=)[^&]+/gi, "$1<masque>");
}
