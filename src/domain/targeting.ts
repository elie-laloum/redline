export function shellQuote(value: string): string {
  return `'${value.replaceAll("'", `'\\''`)}'`;
}

export function renderTargeting(template: string, paths: readonly string[] | undefined): string {
  if (!paths || paths.length === 0) return "";
  const glob = paths.length === 1 ? (paths[0] ?? "") : `{${paths.join(",")}}`;
  return template.replaceAll("{paths}", paths.map(shellQuote).join(" ")).replaceAll("{glob}", shellQuote(glob));
}
