import { existsSync } from "node:fs";
import { AUTH_LABELS, authenticationProblem } from "../adapters/claude-agents.ts";
import { inspectImage, runtimeStatus } from "../adapters/container-runtime.ts";
import { gitAllowFailure } from "../adapters/git.ts";
import type { SecretKey } from "../adapters/secrets.ts";
import { type Connection, testChat, testDesign, testForge, testTracker } from "./connections.ts";
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
  return [...configuration(app), ...secrets(app), ...(await connections(app)), ...(await containers(app)), claude(app), ...(await repositories(app))];
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

/** Each service whose tokens are there, and that is on, is asked who the tokens belong to. */
async function connections(app: AppContext): Promise<Finding[]> {
  const { services } = app.configuration.settings;
  const token = (key: SecretKey) => app.secrets.get(key);
  const probes: (readonly [string, () => Promise<Connection>])[] = [
    ...(token("JIRA_SITE_URL") && token("JIRA_EMAIL") && token("JIRA_API_TOKEN") ? [["Jira", () => testTracker(app.services.tracker)] as const] : []),
    ...(token("GITLAB_TOKEN") ? [["GitLab", () => testForge(app.services.forge)] as const] : []),
    ...(services.slack && token("SLACK_USER_TOKEN") ? [["Slack", () => testChat(app.services.chat, token("SLACK_USER_TOKEN") ?? "")] as const] : []),
    ...(services.figma && token("FIGMA_TOKEN") ? [["Figma", () => testDesign(app.services.design)] as const] : []),
  ];
  return Promise.all(probes.map(async ([label, test]): Promise<Finding> => ({ section: "connexions", label, ...(await test()) })));
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
