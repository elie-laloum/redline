import { authenticationProblem } from "../../adapters/claude-agents.ts";
import type { Connection } from "../../app/connections.ts";
import type { SetupSnapshot } from "../../app/setup.ts";

export const SECTIONS = ["jira", "gitlab", "slack", "figma", "services", "image", "claude", "memory", "registry", "voice", "settings", "check"] as const;
export type SectionId = (typeof SECTIONS)[number];
export type ServiceId = "jira" | "gitlab" | "slack" | "figma";

export const SECTION_LABELS: Readonly<Record<SectionId, string>> = {
  jira: "Jira",
  gitlab: "GitLab",
  slack: "Slack",
  figma: "Figma",
  services: "Services",
  image: "Image des agents",
  claude: "Claude",
  memory: "Memoire",
  registry: "Registre",
  voice: "Voix",
  settings: "Reglages",
  check: "Verification",
};

/** ok: nothing to do. missing: something to fill in. failing: filled in but refused. default: the package's, which works. */
export type SectionState = "ok" | "missing" | "failing" | "default" | "off" | "pending";

export interface SectionStatus {
  readonly state: SectionState;
  readonly detail: string;
}

export type ImageProbe = { readonly state: "present" | "absent" | "error" | "no-runtime"; readonly detail: string };

/** What init learns by asking the outside world, as the answers come in. */
export interface Probes {
  readonly connections: Partial<Record<ServiceId, Connection | "pending">>;
  readonly image: ImageProbe | "pending" | null;
  readonly check: { readonly failed: number } | null;
}

const SERVICE_KEYS = {
  jira: ["JIRA_SITE_URL", "JIRA_EMAIL", "JIRA_API_TOKEN"],
  gitlab: ["GITLAB_TOKEN"],
  slack: ["SLACK_USER_TOKEN"],
  figma: ["FIGMA_TOKEN"],
} as const;

export function serviceKeys(service: ServiceId): readonly string[] {
  return SERVICE_KEYS[service];
}

/** A service whose tokens are all there, and which is on: init can ask it who they belong to. */
export function serviceReady(service: ServiceId, snapshot: SetupSnapshot): boolean {
  if (!serviceOn(service, snapshot)) return false;
  return SERVICE_KEYS[service].every((key) => snapshot.secrets.get(key));
}

export function serviceOn(service: ServiceId, snapshot: SetupSnapshot): boolean {
  const services = snapshot.settings?.services;
  if (service === "slack") return services?.slack ?? true;
  if (service === "figma") return services?.figma ?? true;
  return true;
}

export function sectionStatus(id: SectionId, snapshot: SetupSnapshot, probes: Probes): SectionStatus {
  switch (id) {
    case "jira":
    case "gitlab":
    case "slack":
    case "figma": {
      if (!serviceOn(id, snapshot)) return { state: "off", detail: "desactive" };
      const missing = SERVICE_KEYS[id].filter((key) => !snapshot.secrets.get(key));
      if (missing.length > 0) return { state: "missing", detail: `${missing.join(", ")} a renseigner` };
      const connection = probes.connections[id];
      if (!connection || connection === "pending") return { state: "pending", detail: "connexion en cours de test" };
      return { state: connection.status === "fail" ? "failing" : "ok", detail: connection.detail };
    }
    case "services": {
      const services = snapshot.settings?.services;
      if (!services) return { state: "failing", detail: "reglages illisibles" };
      const off = [!services.slack && "Slack", !services.figma && "Figma", !services.jiraWrites && "ecritures Jira"].filter(Boolean);
      return { state: off.length ? "ok" : "default", detail: off.length ? `desactives : ${off.join(", ")}` : "tous actifs" };
    }
    case "image": {
      const image = probes.image;
      if (!image || image === "pending") return { state: "pending", detail: "verification en cours" };
      return { state: image.state === "present" ? "ok" : image.state === "absent" ? "missing" : "failing", detail: image.detail };
    }
    case "claude": {
      if (!snapshot.settings) return { state: "failing", detail: "reglages illisibles" };
      const mode = snapshot.settings.agents.authentication;
      const problem = authenticationProblem(mode, snapshot.secrets);
      return problem ? { state: "missing", detail: `mode ${mode} : identifiant absent` } : { state: "ok", detail: `mode ${mode}` };
    }
    case "memory": {
      if (!snapshot.memory) return { state: "failing", detail: "reglages illisibles" };
      const where = snapshot.memory.url ?? (snapshot.memory.separate ? snapshot.memory.directory : "dans le home");
      return { state: snapshot.memory.separate ? "ok" : "default", detail: `${snapshot.notes} note(s), ${where}` };
    }
    case "registry":
      if (snapshot.registryError) return { state: "failing", detail: snapshot.registryError.split("\n")[0] ?? "" };
      if (!snapshot.hasRegistry || !snapshot.registry?.repositories.length) return { state: "missing", detail: "aucun depot declare" };
      return { state: "ok", detail: `${snapshot.registry.repositories.length} depot(s)` };
    case "voice":
      return snapshot.voice ? { state: "ok", detail: "voix calibree" } : { state: "default", detail: "modele non calibre" };
    case "settings": {
      if (snapshot.settingsError) return { state: "failing", detail: snapshot.settingsError.split("\n")[0] ?? "" };
      const count = leaves(snapshot.overrides) - (snapshot.overrides.schemaVersion === undefined ? 0 : 1);
      return count > 0 ? { state: "ok", detail: `${count} surcharge(s)` } : { state: "default", detail: "defauts du paquet" };
    }
    case "check":
      if (!probes.check) return { state: "pending", detail: "a lancer" };
      return probes.check.failed ? { state: "failing", detail: `${probes.check.failed} point(s) bloquant(s)` } : { state: "ok", detail: "pret pour un run" };
  }
}

/** The next section that needs the human, after `from`, wrapping around; null once nothing does. */
export function nextIncomplete(statuses: Readonly<Record<SectionId, SectionStatus>>, from: SectionId | null): SectionId | null {
  const start = from ? SECTIONS.indexOf(from) + 1 : 0;
  for (let offset = 0; offset < SECTIONS.length; offset += 1) {
    const id = SECTIONS[(start + offset) % SECTIONS.length] as SectionId;
    if (id === from) continue;
    if (statuses[id].state === "missing" || statuses[id].state === "failing") return id;
  }
  return null;
}

function leaves(tree: unknown): number {
  if (tree === null || typeof tree !== "object" || Array.isArray(tree)) return 1;
  return Object.values(tree).reduce<number>((total, value) => total + leaves(value), 0);
}
