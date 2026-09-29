import { RedlineError } from "../domain/failure.ts";

export interface HttpOptions {
  readonly method?: "GET" | "POST" | "PUT" | "DELETE";
  readonly headers?: Readonly<Record<string, string>>;
  readonly body?: unknown;
  readonly timeoutMs?: number;
  readonly allow?: readonly number[];
}

export interface HttpResponse<T> {
  readonly status: number;
  readonly data: T;
}

const ATTEMPTS = 3;

export async function request<T>(url: string, options: HttpOptions = {}): Promise<HttpResponse<T>> {
  let lastError: unknown = null;
  for (let attempt = 1; attempt <= ATTEMPTS; attempt += 1) {
    try {
      const response = await fetch(url, init(options));
      const text = await response.text();
      const data = parseBody<T>(text, response.headers.get("content-type"));
      if (response.ok || options.allow?.includes(response.status)) return { status: response.status, data };
      if ((response.status === 429 || response.status >= 500) && attempt < ATTEMPTS) {
        await wait(backoffMs(attempt, response.headers.get("retry-after")));
        continue;
      }
      throw new RedlineError(`${options.method ?? "GET"} ${redact(url)} a repondu ${response.status}.`, text.slice(0, 600) || null);
    } catch (error) {
      if (error instanceof RedlineError) throw error;
      lastError = error;
      if (attempt < ATTEMPTS) await wait(backoffMs(attempt, null));
    }
  }
  throw new RedlineError(
    `${options.method ?? "GET"} ${redact(url)} injoignable apres ${ATTEMPTS} tentatives.`,
    lastError instanceof Error ? lastError.message : null,
  );
}

function init(options: HttpOptions): RequestInit {
  const headers: Record<string, string> = { accept: "application/json", ...options.headers };
  if (options.body !== undefined) headers["content-type"] = "application/json; charset=utf-8";
  return {
    method: options.method ?? "GET",
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    signal: AbortSignal.timeout(options.timeoutMs ?? 30_000),
  };
}

function parseBody<T>(text: string, contentType: string | null): T {
  if (!text) return null as T;
  const looksJson = contentType?.includes("json") || /^\s*[[{]/.test(text);
  if (!looksJson) return text as T;
  try {
    return JSON.parse(text) as T;
  } catch {
    return text as T;
  }
}

function backoffMs(attempt: number, retryAfter: string | null): number {
  const advertised = retryAfter ? Number(retryAfter) * 1000 : Number.NaN;
  if (Number.isFinite(advertised) && advertised > 0) return Math.min(advertised, 30_000);
  return 400 * 2 ** (attempt - 1);
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function redact(url: string): string {
  return url.replace(/([?&](token|access_token|private_token)=)[^&]+/gi, "$1<masque>");
}
