export interface Diagnostic {
  readonly file: string;
  readonly line: number | null;
  readonly severity: string;
  readonly rule: string;
  readonly message: string;
}

type CodeClimateEntry = {
  readonly description?: unknown;
  readonly check_name?: unknown;
  readonly severity?: unknown;
  readonly location?: { readonly path?: unknown; readonly lines?: { readonly begin?: unknown } };
};

export function parseCodeClimate(raw: string): Diagnostic[] | null {
  if (!raw.trim()) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!Array.isArray(parsed)) return null;
  return parsed.flatMap((entry: unknown) => {
    if (typeof entry !== "object" || entry === null) return [];
    const item = entry as CodeClimateEntry;
    return [
      {
        file: typeof item.location?.path === "string" ? item.location.path : "?",
        line: typeof item.location?.lines?.begin === "number" ? item.location.lines.begin : null,
        severity: typeof item.severity === "string" ? item.severity : "unknown",
        rule: typeof item.check_name === "string" ? item.check_name : "?",
        message: typeof item.description === "string" ? item.description : "",
      },
    ];
  });
}
