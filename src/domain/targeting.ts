const SECOND_SHELL = /(?:^|[\s;&|(])(?:npm|npx)(?=\s|$)/;

export function shellQuote(value: string): string {
  return `'${value.replaceAll("'", `'\\''`)}'`;
}

export function renderTargeting(template: string, paths: readonly string[] | undefined): string {
  if (!paths || paths.length === 0) return "";
  const glob = paths.length === 1 ? (paths[0] ?? "") : `{${paths.join(",")}}`;
  return template.replaceAll("{paths}", paths.map(shellQuote).join(" ")).replaceAll("{glob}", shellQuote(glob));
}

/**
 * npm and npx run the line again through `/bin/sh`, which expands the brace list a multi-file `{glob}`
 * renders, so the runner receives one word per file instead of a single pattern.
 */
export function globCrossesSecondShell(command: string, template: string): boolean {
  return template.includes("{glob}") && SECOND_SHELL.test(command);
}
