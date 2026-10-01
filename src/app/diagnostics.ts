import { existsSync } from "node:fs";
import { AUTH_LABELS, authenticationProblem } from "../adapters/claude-agents.ts";
import { inspectImage, runtimeStatus } from "../adapters/container-runtime.ts";
import { gitAllowFailure } from "../adapters/git.ts";
import { describeError } from "../domain/failure.ts";
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
  return [...configuration(app), ...secrets(app), ...(await tracker(app)), ...(await containers(app)), claude(app), ...(await repositories(app))];
}

function configuration(app: AppContext): Finding[] {
  const { sources, registry } = app.configuration;
  return [
    { section: "configuration", label: "reglages", status: "ok", detail: sources.settings ? `${sources.settings} — surcharges des defauts du paquet` : "defauts du paquet" },
    sources.registry
      ? { section: "configuration", label: "registre", status: "ok", detail: `${registry.repositories.length} repos — ${sources.registry}` }
      : { section: "configuration", label: "registre", status: "fail", detail: `aucun registre dans ${app.paths.registry} : declare tes repos avec bun redline init` },
  ];
}

function secrets(app: AppContext): Finding[] {
  return app.secrets.describe(app.configuration.settings.services).map(({ key, present, required, unused }) => ({
    section: "secrets",
    label: key,
    status: present || unused ? "ok" : required ? "fail" : "warn",
    detail: unused ? "service desactive" : present ? "renseigne" : required ? `manquant dans ${app.paths.env}` : "facultatif, absent",
  }));
}

async function containers(app: AppContext): Promise<Finding[]> {
  const status = await runtimeStatus(app.paths.home);
  const findings: Finding[] = [{ section: "conteneurs", label: "runtime", status: status.available ? "ok" : "fail", detail: status.detail }];
  if (!status.available || !status.cli) return findings;
  const image = app.configuration.settings.sandbox.image;
  const inspected = await inspectImage(app.paths.home, status.cli, image);
  const details = { present: image, absent: `${image} absente : bun redline image build` };
  findings.push({
    section: "conteneurs",
    label: "image des agents",
    status: inspected.state === "present" ? "ok" : "fail",
    detail: inspected.state === "error" ? `${image} illisible : ${inspected.detail}` : details[inspected.state],
  });
  return findings;
}

async function tracker(app: AppContext): Promise<Finding[]> {
  if (!app.secrets.get("JIRA_SITE_URL") || !app.secrets.get("JIRA_EMAIL") || !app.secrets.get("JIRA_API_TOKEN")) return [];
  const finding = (status: FindingStatus, detail: string): Finding => ({ section: "secrets", label: "connexion Jira", status, detail });
  try {
    const identity = await app.services.tracker.whoami();
    return [identity ? finding("ok", `connecte en tant que ${identity.email}`) : finding("fail", "identifiants refuses : verifie JIRA_EMAIL et JIRA_API_TOKEN")];
  } catch (error) {
    return [finding("fail", describeError(error))];
  }
}

function claude(app: AppContext): Finding {
  const problem = authenticationProblem(app.authentication, app.secrets);
  return { section: "agents", label: `identifiants Claude (${app.authentication})`, status: problem ? "fail" : "ok", detail: problem ?? AUTH_LABELS[app.authentication] };
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
