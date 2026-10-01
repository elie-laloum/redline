import { existsSync } from "node:fs";
import { join } from "node:path";
import { ensureHome } from "../../app/home.ts";
import { ensureMemory, memoryRepository } from "../../app/memory-repository.ts";
import { homeDirectory, type Paths, pathsOf } from "../../app/paths.ts";
import { loadSettings } from "../../app/settings.ts";
import { fail } from "../../domain/failure.ts";
import { runSetup } from "../tui/setup/setup.ts";
import { openTerminal } from "../tui/terminal.ts";

export async function initCommand(): Promise<number> {
  if (!process.stdout.isTTY || !process.stdin.isTTY) {
    fail("init a besoin d'un terminal.", "Sans terminal, renseigne a la main ~/.redline/.env, redline.yaml et repositories.yaml : docs/setup.md dit comment.");
  }
  const paths = pathsOf(homeDirectory());
  await prepareHome(paths);
  const terminal = await openTerminal();
  try {
    await runSetup(terminal.renderer, paths);
  } finally {
    terminal.close();
  }
  return 0;
}

/** The home's layout, as start lays it out; a memory of its own is cloned first, or left alone when it cannot be. */
async function prepareHome(paths: Paths): Promise<void> {
  let memory = { ...paths };
  let layoutMemory = true;
  try {
    const repository = memoryRepository(loadSettings(paths), paths.home);
    memory = { ...paths, memory: repository.directory };
    if (repository.separate) {
      await ensureMemory(repository).catch(() => {});
      layoutMemory = existsSync(join(repository.directory, ".git"));
    }
  } catch {
    // Settings that do not load are shown in their section; the home is laid out all the same.
  }
  await ensureHome(memory, { layoutMemory });
}
