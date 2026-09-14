import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { resetConfigCache } from "../plugins/autopilot/mcp/lib/config.ts";
import { resetEnvCache } from "../plugins/autopilot/mcp/lib/env.ts";

export const PROJECT_ROOT = fileURLToPath(new URL("..", import.meta.url));

/**
 * Chaque test qui touche au disque prend son propre `~/.autopilot`, jetable.
 * Les tests lisent en revanche la configuration **reelle** du projet : un test
 * qui passerait sur une config de fixture et casserait sur la vraie ne servirait
 * a rien.
 */
export function sandboxHome(): { home: string; cleanup: () => void } {
  const home = mkdtempSync(join(tmpdir(), "autopilot-test-"));
  const previous = process.env.AUTOPILOT_HOME;
  process.env.AUTOPILOT_HOME = home;
  process.env.AUTOPILOT_PROJECT_ROOT = PROJECT_ROOT;
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
