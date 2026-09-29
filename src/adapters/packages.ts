import { existsSync, readFileSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";

export function packagesOf(root: string, files: readonly string[]): string[] {
  const packages = new Set<string>();
  for (const file of files) {
    const name = nearestPackageName(root, file);
    if (name) packages.add(name);
  }
  return [...packages].sort();
}

function nearestPackageName(root: string, file: string): string | null {
  let directory = dirname(join(root, file));
  while (directory.startsWith(root)) {
    const manifest = join(directory, "package.json");
    if (existsSync(manifest)) {
      if (directory === root) return null;
      try {
        return (JSON.parse(readFileSync(manifest, "utf8")) as { name?: string }).name ?? relative(root, directory).split(sep).join("/");
      } catch {
        return relative(root, directory).split(sep).join("/");
      }
    }
    const parent = dirname(directory);
    if (parent === directory) return null;
    directory = parent;
  }
  return null;
}

export function manifestVersion(root: string, manifest: string): string | null {
  try {
    const version = (JSON.parse(readFileSync(join(root, manifest), "utf8")) as { version?: unknown }).version;
    return typeof version === "string" && version.trim() ? version.trim() : null;
  } catch {
    return null;
  }
}
