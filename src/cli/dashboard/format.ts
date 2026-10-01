export function formatDuration(ms: number): string {
  const seconds = Math.max(0, Math.round(ms / 1000));
  if (seconds < 60) return `${seconds} s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min ${String(seconds % 60).padStart(2, "0")} s`;
  return `${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, "0")} min`;
}

export function formatTokens(count: number): string {
  if (count < 1000) return String(count);
  if (count < 1_000_000) return `${(count / 1000).toFixed(count < 10_000 ? 1 : 0)}k`;
  return `${(count / 1_000_000).toFixed(1)}M`;
}

/** One line for a tool call: its name and the argument that says what it touches. */
export function describeTool(name: string, input: unknown): string {
  const fields = typeof input === "object" && input !== null ? (input as Record<string, unknown>) : {};
  const target = [fields.file_path, fields.path, fields.command, fields.pattern, fields.url].find((value): value is string => typeof value === "string" && value.length > 0);
  if (!target) return name;
  const line = target.replace(/\s+/g, " ").trim();
  return `${name} ${line.length > 80 ? `${line.slice(0, 79)}…` : line}`;
}

/** How long ago something happened, to the unit that matters. */
export function formatAge(ms: number): string {
  const minutes = Math.floor(Math.max(0, ms) / 60_000);
  if (minutes < 1) return "a l'instant";
  if (minutes < 60) return `il y a ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `il y a ${hours} h`;
  return `il y a ${Math.floor(hours / 24)} j`;
}
