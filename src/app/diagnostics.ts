import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { run } from "../adapters/exec.ts";
import { gitAllowFailure } from "../adapters/git.ts";
import { runtimeStatus } from "../adapters/container-runtime.ts";
import type { AppContext } from "./context.ts";
import { expandTilde } from "./paths.ts";

export type FindingStatus = "ok" | "warn" | "fail";

export interface Finding {
  readonly section: string;
  readonly label: string;
  readonly status: FindingStatus;
  readonly detail: string;
}

export async function diagnose(app: AppContext): Promise<Finding[]> {
  return [...configuration(app), ...secrets(app), ...(await containers(app)), claude(), ...(await repositories(app))];
}

function configuration(app: AppContext): Finding[] {
  const { sources, registry } = app.configuration;
  const origin = (file: string, own: string) => (file === own ? "personnel" : "modele (repli)");
  return [
    { section: "configuration", label: "reglages", status: "ok", detail: `${sources.settings} — ${origin(sources.settings, app.paths.settings)}` },
    { section: "configuration", label: "registre", status: "ok", detail: `${registry.repositories.length} repos — ${origin(sources.registry, app.paths.registry)}` },
  ];
}

function secrets(app: AppContext): Finding[] {
  return app.secrets.describe().map(({ key, present, required }) => ({
    section: "secrets",
    label: key,
    status: present ? "ok" : required ? "fail" : "warn",
    detail: present ? "renseigne" : required ? `manquant dans ${app.paths.env}` : "facultatif, absent",
  }));
}

async function containers(app: AppContext): Promise<Finding[]> {
  const status = await runtimeStatus(app.paths.home);
  const findings: Finding[] = [{ section: "conteneurs", label: "runtime", status: status.available ? "ok" : "fail", detail: status.detail }];
  if (!status.available || !status.cli) return findings;
  const image = app.configuration.settings.sandbox.image;
  const inspected = await run(`${status.cli} image inspect ${image}`, { cwd: app.paths.home, timeoutMs: 20_000, silenceMs: 20_000 });
  findings.push({
    section: "conteneurs",
    label: "image des agents",
    status: inspected.exitCode === 0 ? "ok" : "fail",
    detail: inspected.exitCode === 0 ? image : `${image} absente : bun redline image build`,
  });
  return findings;
}

function claude(): Finding {
  const file = join(homedir(), ".claude", ".credentials.json");
  const present = existsSync(file) || Boolean(process.env.CLAUDE_CODE_OAUTH_TOKEN);
  return { section: "agents", label: "identifiants Claude", status: present ? "ok" : "fail", detail: present ? "compte disponible" : `${file} absent : claude setup-token` };
}

async function repositories(app: AppContext): Promise<Finding[]> {
  return Promise.all(
    app.configuration.registry.repositories.map(async (repo): Promise<Finding> => {
      const path = expandTilde(repo.path);
      if (!existsSync(path)) return { section: "repos", label: repo.name, status: "warn", detail: `${path} absent du disque` };
      const branch = await gitAllowFailure(path, ["rev-parse", "--abbrev-ref", "HEAD"]);
      if (!branch.ok) return { section: "repos", label: repo.name, status: "fail", detail: `${path} n'est pas un depot git` };
      const dirty = (await gitAllowFailure(path, ["status", "--porcelain"])).stdout !== "";
      const offBase = branch.stdout !== repo.baseBranch;
      const notes = [dirty ? "modifications locales" : "", offBase ? `sur ${branch.stdout}, pas ${repo.baseBranch}` : ""].filter(Boolean);
      return {
        section: "repos",
        label: repo.name,
        status: notes.length ? "warn" : "ok",
        detail: notes.length ? `${notes.join(", ")} : les scouts liront cet etat` : path,
      };
    }),
  );
}
