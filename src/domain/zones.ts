export type Zone = "tests" | "code";

const TEST_FILE = /(^|\/)(?:tests?|__tests__|spec|e2e|cypress)\/|\.(?:test|spec)\.[cm]?[jt]sx?$|\.stories\.[cm]?[jt]sx?$/i;

export function isTestFile(path: string): boolean {
  return TEST_FILE.test(path);
}

export function zoneViolations(zone: Zone, files: readonly string[]): string[] {
  return files.filter((file) => (zone === "tests" ? !isTestFile(file) : isTestFile(file)));
}
