import type { CliRenderer } from "@opentui/core";
import { inspectImage, runtimeStatus } from "../../../adapters/container-runtime.ts";
import { type Connection, testChat, testDesign, testForge, testTracker } from "../../../app/connections.ts";
import { createContext, remoteServices } from "../../../app/context.ts";
import { diagnose, type Finding } from "../../../app/diagnostics.ts";
import type { Paths } from "../../../app/paths.ts";
import { readSetup, type SetupSnapshot } from "../../../app/setup.ts";
import { describeError } from "../../../domain/failure.ts";
import { type ImageProbe, nextIncomplete, type Probes, SECTIONS, type SectionId, type SectionStatus, type ServiceId, sectionStatus, serviceReady } from "../../setup/sections.ts";
import { handOff, waitForEnter } from "../handoff.ts";
import { type Drafts, type PageContext, sectionPage } from "./pages.ts";
import { createSetupScreen, type SetupScreen } from "./screen.ts";

/**
 * The setup screen: every section read from the home, each service asked who its tokens belong
 * to as soon as they are there, and every change written as soon as it is made.
 */
export async function runSetup(renderer: CliRenderer, paths: Paths): Promise<void> {
  let snapshot = readSetup(paths);
  const probes: { connections: Partial<Record<ServiceId, Connection | "pending">>; image: ImageProbe | "pending" | null; check: Probes["check"] } = { connections: {}, image: null, check: null };
  let findings: readonly Finding[] | null = null;
  const drafts: Drafts = { memory: { url: "", path: "", importNotes: true }, registryBackup: null, removing: null };
  const statuses = () => Object.fromEntries(SECTIONS.map((id) => [id, sectionStatus(id, snapshot, probes)])) as Record<SectionId, SectionStatus>;
  let screen: SetupScreen | null = null;

  const context: PageContext = {
    snapshot: () => snapshot,
    probes: () => probes,
    reload() {
      snapshot = readSetup(paths);
      screen?.refresh();
    },
    testService(service) {
      if (!serviceReady(service, snapshot)) return;
      probes.connections[service] = "pending";
      screen?.refresh();
      void connectionOf(service, snapshot).then((connection) => {
        probes.connections[service] = connection;
        screen?.refresh();
      });
    },
    async probeImage() {
      probes.image = "pending";
      screen?.refresh();
      probes.image = await imageOf(paths, snapshot);
      screen?.refresh();
    },
    notify: (tone, text) => screen?.notify(tone, text),
    open: (page) => screen?.open(page),
    handOff: (run, pause) => handOff(renderer, run, pause),
    waitForEnter,
    findings: () => findings,
    async runCheck() {
      findings = await checked(paths);
      probes.check = { failed: findings.filter((finding) => finding.status === "fail").length };
      screen?.notify(probes.check.failed ? "error" : "success", probes.check.failed ? `${probes.check.failed} point(s) bloquant(s).` : "Pret pour un run.");
    },
    drafts,
  };

  screen = createSetupScreen(renderer, { title: paths.home, statuses, page: (id) => sectionPage(id, context) }, nextIncomplete(statuses(), null) ?? "jira");
  for (const service of ["jira", "gitlab", "slack", "figma"] as const) context.testService(service);
  void context.probeImage();
  await screen.left;
  screen.destroy();
}

async function connectionOf(service: ServiceId, snapshot: SetupSnapshot): Promise<Connection> {
  const services = remoteServices(snapshot.secrets);
  try {
    switch (service) {
      case "jira":
        return await testTracker(services.tracker());
      case "gitlab":
        return await testForge(services.forge());
      case "slack":
        return await testChat(services.chat(), snapshot.secrets.get("SLACK_USER_TOKEN") ?? "");
      case "figma":
        return await testDesign(services.design());
    }
  } catch (error) {
    return { status: "fail", detail: describeError(error) };
  }
}

async function imageOf(paths: Paths, snapshot: SetupSnapshot): Promise<ImageProbe> {
  const name = snapshot.settings?.sandbox.image;
  if (!name) return { state: "error", detail: "reglages illisibles : le nom de l'image est inconnu" };
  const runtime = await runtimeStatus(paths.home);
  if (!runtime.available || !runtime.cli) return { state: "no-runtime", detail: runtime.detail };
  const inspected = await inspectImage(paths.home, runtime.cli, name);
  if (inspected.state === "present") return { state: "present", detail: `${name} presente` };
  if (inspected.state === "absent") return { state: "absent", detail: `${name} absente : construis-la` };
  return { state: "error", detail: inspected.detail };
}

/** check, as bun redline check runs it; a configuration that does not load is itself the finding. */
async function checked(paths: Paths): Promise<Finding[]> {
  try {
    return await diagnose(createContext({ home: paths.home }));
  } catch (error) {
    return [{ section: "configuration", label: "chargement", status: "fail", detail: describeError(error) }];
  }
}
