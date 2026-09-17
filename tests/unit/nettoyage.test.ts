import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { after, describe, it } from "node:test";
import { lockPath } from "../../plugins/autopilot/mcp/lib/paths.ts";
import { toolByName } from "../../plugins/autopilot/mcp/registry.ts";
import { sandboxHome } from "../helpers.ts";

const sandbox = sandboxHome();
after(() => sandbox.cleanup());

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const alive = (pid: number): boolean => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

/**
 * Le run se nettoie tout seul, ou il ne se nettoie pas.
 *
 * Trois debris s'accumulaient et se ramassaient a la main : des runners de
 * tests orphelins — un compte a un jour et seize heures de CPU —, des serveurs
 * MCP qui survivaient a leur session — quatorze un jeudi, le plus vieux du
 * mardi —, et un verrou de ticket qu'il fallait effacer soi-meme apres chaque
 * run tue net.
 *
 * Les trois avaient la meme racine : un enfant suspendu. Il tenait les tubes,
 * donc `close` n'arrivait pas ; il tenait la boucle d'evenements, donc le
 * serveur ne pouvait pas sortir meme quand son client etait parti.
 */
describe("un process qui ne peut pas sortir tant qu'un enfant pend", () => {
  it("sort quand rien ne pend", async () => {
    const child = spawn("node", ["-e", 'process.stdin.resume(); process.stdin.on("end", () => {});'], {
      stdio: ["pipe", "ignore", "ignore"],
    });
    await wait(600);
    child.stdin.end();
    await wait(2_000);
    assert.equal(alive(child.pid as number), false);
  });

  it("reste vivant quand un enfant tient les tubes — la forme du bug", async () => {
    const code = `process.stdin.resume(); process.stdin.on("end", () => {});
      require("node:child_process").spawn("sh", ["-c", "sleep 30 & sleep 30"]);`;
    const child = spawn("node", ["-e", code], { stdio: ["pipe", "ignore", "ignore"] });
    await wait(600);
    child.stdin.end();
    await wait(2_000);
    // C'est ce constat qui justifie le `process.exit()` explicite de l'arret :
    // vider la boucle ne suffit pas, il faut sortir sans lui demander son avis.
    assert.equal(alive(child.pid as number), true, "le cas du bug ne se reproduit plus, le test ne prouve plus rien");
    try {
      process.kill(-(child.pid as number), "SIGKILL");
    } catch {
      child.kill("SIGKILL");
    }
  });
});

describe("le verrou de ticket se reprend tout seul", () => {
  const acquire = toolByName("acquire-ticket-lock");

  it("refuse un verrou dont le detenteur tourne encore", () => {
    const path = lockPath("LOCK-1");
    mkdirSync(dirname(path), { recursive: true });
    // Notre propre pid : vivant par construction.
    writeFileSync(path, JSON.stringify({ runId: "vieux", pid: process.pid, at: "2026-09-15T00:00:00Z" }));
    assert.ok(acquire);
    assert.throws(() => acquire.handler({ ticketId: "LOCK-1", runId: "neuf" }, {} as never));
  });

  it("reprend un verrou dont le detenteur est mort, sans intervention", async () => {
    const path = lockPath("LOCK-2");
    mkdirSync(dirname(path), { recursive: true });
    // Un pid vraiment libere. Il faut attendre `exit` : un enfant tue mais pas
    // encore moissonne reste un zombie, et un zombie repond encore a
    // `kill(pid, 0)`. En production le detenteur est le process d'une autre
    // session, moissonne par init — le piege est propre au test.
    const dead = spawn("node", ["-e", ""], { stdio: "ignore" });
    const deadPid = dead.pid as number;
    await new Promise((resolve) => dead.once("exit", resolve));
    writeFileSync(path, JSON.stringify({ runId: "mort", pid: deadPid, at: "2026-09-15T00:00:00Z" }));

    assert.ok(acquire);
    const result = acquire.handler({ ticketId: "LOCK-2", runId: "neuf" }, {} as never) as { locked: boolean };
    assert.equal(result.locked, true);
    assert.equal((JSON.parse(readFileSync(path, "utf8")) as { runId: string }).runId, "neuf");
  });

  it("garde un verrou qu'il ne sait pas dater plutot que de le voler", () => {
    const path = lockPath("LOCK-3");
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, "ecrit a la main, pas du JSON");
    assert.ok(acquire);
    // Sans pid lisible, on ne tranche pas : c'est l'humain qui decide.
    assert.throws(() => acquire.handler({ ticketId: "LOCK-3", runId: "neuf" }, {} as never));
  });
});

/**
 * La configuration locale suit le worktree.
 *
 * `.env` est gitignore : `git worktree add` ne l'emmene pas, et le worktree
 * demarre sans les secrets. Sur `sheet-service`, dont la CLAUDE.md previent
 * que le serveur ne boote pas sans ses quatre valeurs obligatoires, le
 * red-checker de FT-1042 a escalade sur ce seul motif — apres avoir passe
 * l'etape a chercher pourquoi les tests fonctionnels ne demarraient pas.
 */
describe("setup-repo porte la configuration locale", () => {
  it("copie ce que le registre declare, et seulement ca", async () => {
    const { mkdtempSync, writeFileSync: write, existsSync, readFileSync: read } = await import("node:fs");
    const { join } = await import("node:path");
    const { tmpdir } = await import("node:os");

    const source = mkdtempSync(join(tmpdir(), "source-"));
    const worktree = mkdtempSync(join(tmpdir(), "worktree-"));
    write(join(source, ".env"), "LEGACY_API_URL=http://exemple");
    write(join(source, ".env.local"), "modele=non-declare");

    const { carryLocalFiles } = await import("../../plugins/autopilot/mcp/tools/git.ts");
    const carried = carryLocalFiles({ path: source, localFiles: [".env"] } as never, worktree);

    assert.deepEqual(carried.copied, [".env"]);
    assert.equal(read(join(worktree, ".env"), "utf8"), "LEGACY_API_URL=http://exemple");
    // Non declare, donc non copie : le registre decide, pas un glob.
    assert.equal(existsSync(join(worktree, ".env.local")), false);
  });

  it("n'ecrase jamais un fichier deja present dans le worktree", async () => {
    const { mkdtempSync, writeFileSync: write, readFileSync: read } = await import("node:fs");
    const { join } = await import("node:path");
    const { tmpdir } = await import("node:os");

    const source = mkdtempSync(join(tmpdir(), "source-"));
    const worktree = mkdtempSync(join(tmpdir(), "worktree-"));
    write(join(source, ".env"), "depuis=la-source");
    write(join(worktree, ".env"), "deja=sur-place");

    const { carryLocalFiles } = await import("../../plugins/autopilot/mcp/tools/git.ts");
    const carried = carryLocalFiles({ path: source, localFiles: [".env"] } as never, worktree);

    assert.deepEqual(carried.copied, []);
    assert.equal(read(join(worktree, ".env"), "utf8"), "deja=sur-place");
  });

  it("signale ce qui manque a la source au lieu de le taire", async () => {
    const { mkdtempSync } = await import("node:fs");
    const { join } = await import("node:path");
    const { tmpdir } = await import("node:os");

    const source = mkdtempSync(join(tmpdir(), "source-"));
    const worktree = mkdtempSync(join(tmpdir(), "worktree-"));

    const { carryLocalFiles } = await import("../../plugins/autopilot/mcp/tools/git.ts");
    const carried = carryLocalFiles({ path: source, localFiles: [".env"] } as never, worktree);

    // Le silence ferait croire a une copie reussie, et l'echec reapparaitrait
    // trois etapes plus loin, deguise en test rouge.
    assert.deepEqual(carried.missing, [".env"]);
  });

  it("refuse un chemin qui sort du depot", async () => {
    const { mkdtempSync } = await import("node:fs");
    const { join } = await import("node:path");
    const { tmpdir } = await import("node:os");

    const source = mkdtempSync(join(tmpdir(), "source-"));
    const worktree = mkdtempSync(join(tmpdir(), "worktree-"));

    const { carryLocalFiles } = await import("../../plugins/autopilot/mcp/tools/git.ts");
    assert.throws(() => carryLocalFiles({ path: source, localFiles: ["../../.ssh/id_rsa"] } as never, worktree));
  });
});
