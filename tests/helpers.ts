import { copyFileSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { configPathOf, resetConfigCache } from "../plugins/autopilot/mcp/lib/config.ts";
import { resetEnvCache } from "../plugins/autopilot/mcp/lib/env.ts";

export const PROJECT_ROOT = fileURLToPath(new URL("..", import.meta.url));

/**
 * Chaque test qui touche au disque prend son propre `~/.autopilot`, jetable.
 * Les tests lisent en revanche la configuration **reelle** du projet : un test
 * qui passerait sur une config de fixture et casserait sur la vraie ne servirait
 * a rien.
 */
export function sandboxHome(projectRoot = PROJECT_ROOT): { home: string; cleanup: () => void } {
  const home = mkdtempSync(join(tmpdir(), "autopilot-test-"));
  const previous = process.env.AUTOPILOT_HOME;
  process.env.AUTOPILOT_HOME = home;
  // Un test qui tourne sur un registre de fixture passe sa propre racine : sans
  // ca, le `~/.autopilot` jetable ramenerait le registre de la machine avec lui.
  process.env.AUTOPILOT_PROJECT_ROOT = projectRoot;
  resetConfigCache();
  return {
    home,
    cleanup: () => {
      if (previous === undefined) delete process.env.AUTOPILOT_HOME;
      else process.env.AUTOPILOT_HOME = previous;
      rmSync(home, { recursive: true, force: true });
      resetConfigCache();
      resetEnvCache();
    },
  };
}

export function useProjectConfig(): void {
  process.env.AUTOPILOT_PROJECT_ROOT = PROJECT_ROOT;
  resetConfigCache();
}

/**
 * Un projet autopilot jetable : son propre registre, sa propre configuration.
 *
 * Un test de comportement ne doit pas dependre du registre de la machine qui le
 * lance. `repositories.yaml` decrit une infrastructure, il varie d'un poste a
 * l'autre et il est gitignore : un test qui nomme ses repos y lit un jour des
 * noms qui n'existent plus. Ce qui reste verifie sur la configuration reelle,
 * ce sont ses invariants — jamais son contenu.
 */
export function sandboxProject(files: { registry?: string; config?: string }): { root: string; cleanup: () => void } {
  const root = mkdtempSync(join(tmpdir(), "autopilot-projet-"));
  const previous = process.env.AUTOPILOT_PROJECT_ROOT;

  if (files.registry) writeFileSync(join(root, "repositories.yaml"), files.registry, "utf8");
  else copyFileSync(configPathOf("repositories.yaml"), join(root, "repositories.yaml"));

  if (files.config) writeFileSync(join(root, "autopilot.yaml"), files.config, "utf8");
  else copyFileSync(configPathOf("autopilot.yaml"), join(root, "autopilot.yaml"));

  process.env.AUTOPILOT_PROJECT_ROOT = root;
  resetConfigCache();
  return {
    root,
    cleanup: () => {
      if (previous === undefined) delete process.env.AUTOPILOT_PROJECT_ROOT;
      else process.env.AUTOPILOT_PROJECT_ROOT = previous;
      rmSync(root, { recursive: true, force: true });
      resetConfigCache();
    },
  };
}
