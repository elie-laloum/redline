import assert from "node:assert/strict";
import { describe, it } from "bun:test";
import type { AgentObservation, TaskStatus, WorkflowEvent } from "@elie-laloum/outpost";
import { begin, createDashboard, type Dashboard, interrupt, LIMITS, lanesOf, progressOf, reduce, repoProgress, runUsage, usageSeries } from "../../src/cli/dashboard/model.ts";
import type { RunEvent, RunPhase } from "../../src/domain/run-events.ts";

const T0 = Date.parse("2026-09-30T10:00:00Z");
const NO_USAGE = { input: 0, cached: 0, output: 0 };

function phase(name: RunPhase, tasks: Record<string, TaskStatus>, repos: string[] = []): RunEvent {
  return {
    type: "phase",
    phase: name,
    tasks: Object.entries(tasks).map(([key, status]) => ({ key, status, attempts: 0, startedAt: null, finishedAt: null, cached: false })),
    repos,
    usage: NO_USAGE,
    earlier: NO_USAGE,
  };
}

function workflow(type: WorkflowEvent["type"], key: string, at: number, extra: Partial<WorkflowEvent> = {}): RunEvent {
  return { type: "workflow", event: { executionId: "x", workflow: "redline.delivery", timestamp: new Date(at).toISOString(), type, key, ...extra } };
}

function agent(task: string, role: "developer" | "scope-scout" | "code-adversary", event: Partial<AgentObservation> & Pick<AgentObservation, "kind">, lane?: string): RunEvent {
  return { type: "agent", source: { task, ...(lane ? { lane } : {}) }, role, event: { pass: 1, at: "", ...event } as AgentObservation };
}

function play(events: RunEvent[], start: Dashboard = createDashboard({ key: "FT-1", title: "Filtrer la liste" }, T0)): Dashboard {
  return events.reduce((state, event, index) => reduce(state, event, T0 + (index + 1) * 1000), start);
}

const DELIVERY = { "core.workspace": "waiting", "core.tests": "waiting", "core.code": "waiting", "core.summary": "waiting", "app.workspace": "waiting", "app.summary": "waiting" } as const;

describe("le modele du tableau de bord", () => {
  it("liste toutes les taches de la phase des son annonce, taches restaurees comprises", () => {
    const state = play([phase("delivery", { ...DELIVERY, "core.workspace": "done" }, ["core", "app"])]);
    assert.equal(state.phase, "delivery");
    assert.deepEqual(
      state.tasks.map((row) => [row.key, row.label, row.repo, row.status]),
      [
        ["core.workspace", "core — preparation", "core", "done"],
        ["core.tests", "core — tests", "core", "waiting"],
        ["core.code", "core — convergence du code", "core", "waiting"],
        ["core.summary", "core — bilan", "core", "waiting"],
        ["app.workspace", "app — preparation", "app", "waiting"],
        ["app.summary", "app — bilan", "app", "waiting"],
      ],
    );
    assert.deepEqual(progressOf(state), { done: 1, total: 6 });
    assert.equal(state.journal.at(-1)?.text, "— Livraison —");
  });

  it("garde ce qu'il a vu quand la meme phase est reannoncee apres une reponse", () => {
    const state = play([
      phase("framing", { functional: "waiting", plan: "waiting" }),
      workflow("task", "functional", T0, { status: "active" }),
      agent("functional", "developer", { kind: "text", text: "Je lis le ticket" }),
      workflow("usage", "functional", T0, { usage: { input: 100, cached: 0, output: 20 } }),
      phase("framing", { functional: "waiting-input", plan: "waiting" }),
    ]);
    assert.equal(state.tasks.find((row) => row.key === "functional")?.tokens, 120);
    assert.equal(lanesOf(state, "functional").length, 1);
    assert.equal(state.journal.filter((entry) => entry.text === "— Cadrage —").length, 1);
  });

  it("garde les phases finies a l'ecran, avec ce que leurs agents ont dit et fait", () => {
    const state = play([
      phase("framing", { plan: "waiting" }),
      workflow("loop", "plan", T0, { round: 2 }),
      agent("plan", "developer", { kind: "text", text: "plan" }),
      { type: "gate", task: "plan", gate: "validite", round: 1, verdict: "pass", spent: 0, budget: 2, text: null },
      phase("delivery", DELIVERY, ["core", "app"]),
    ]);
    assert.deepEqual(state.tasks.map((row) => `${row.phase}:${row.key}`).slice(0, 2), ["framing:plan", "delivery:core.workspace"]);
    assert.equal(lanesOf(state, "plan").length, 1);
    assert.equal(state.gates.plan?.length, 1);
    assert.equal(state.loop, null);
    assert.deepEqual(progressOf(state), { done: 0, total: 6 });
    assert.ok(state.journal.some((entry) => entry.text === "✓ Plan · validite"));
  });

  it("garde chaque phase a sa place quand un run est rejoue de bout en bout", () => {
    const state = play([
      phase("framing", { ticket: "done", plan: "done" }),
      { type: "output", task: "ticket", value: { key: "FT-1" } },
      phase("delivery", { "core.summary": "done" }, ["core"]),
      phase("closing", { prose: "active" }, ["core"]),
    ]);
    assert.deepEqual(
      state.tasks.map((row) => `${row.phase}:${row.key}:${row.status}`),
      ["framing:ticket:done", "framing:plan:done", "delivery:core.summary:done", "closing:prose:active"],
    );
    assert.deepEqual(state.outputs.ticket, { key: "FT-1" });
    assert.deepEqual(progressOf(state), { done: 0, total: 1 });
  });

  it("repart d'une nouvelle session sans question en attente, l'horloge remise a son debut", () => {
    const request = { id: "r1", executionId: "x", key: "functional", requestedAt: "", question: "Grill fonctionnel — 1/2\nQuelle periode ?", choices: ["Mois en cours"] };
    const asked = play([phase("framing", { functional: "active" }), workflow("input-request", "functional", T0), { type: "question", request }]);
    assert.equal(asked.asked?.question, request.question);
    const resumed = begin(asked, T0 + 3_600_000);
    assert.deepEqual([resumed.waiting, resumed.asked, resumed.startedAt, resumed.now], [null, null, T0 + 3_600_000, T0 + 3_600_000]);
    assert.equal(resumed.tasks.length, 1);
  });

  it("montre interrompues les taches qu'un process mort a laissees en cours", () => {
    const state = play([phase("delivery", { ...DELIVERY, "core.workspace": "done" }), workflow("task", "core.tests", T0, { status: "active" })]);
    const stopped = interrupt(state, T0 + 90_000);
    const tests = stopped.tasks.find((row) => row.key === "core.tests");
    assert.deepEqual([tests?.status, tests?.finishedAt], ["cancelled", T0 + 90_000]);
    assert.equal(stopped.tasks.find((row) => row.key === "core.workspace")?.status, "done");
    assert.equal(stopped.active, null);
  });

  it("suit la tache active et note la duree de celles qui finissent", () => {
    const state = play([
      phase("delivery", DELIVERY, ["core", "app"]),
      workflow("task", "core.workspace", T0 + 1000, { status: "active", attempt: 1 }),
      workflow("task", "core.workspace", T0 + 66_000, { status: "done", durationMs: 65_000 }),
      workflow("task", "core.tests", T0 + 67_000, { status: "active" }),
      workflow("task", "core.tests", T0 + 70_000, { status: "failed", error: "docker ne repond pas" }),
    ]);
    assert.equal(state.active, "core.tests");
    const workspace = state.tasks.find((row) => row.key === "core.workspace");
    assert.deepEqual([workspace?.status, workspace?.startedAt, workspace?.finishedAt, workspace?.attempts], ["done", T0 + 1000, T0 + 66_000, 1]);
    assert.deepEqual(
      state.journal.slice(-2).map((entry) => [entry.tone, entry.text]),
      [
        ["success", "✓ core — preparation — 1 min 05 s"],
        ["error", "✗ core — tests — docker ne repond pas"],
      ],
    );
    assert.deepEqual(repoProgress(state), { done: 0, total: 2, current: null });
  });

  it("compte les depots livres par leur bilan, et nomme celui qui travaille", () => {
    const state = play([
      phase("delivery", { ...DELIVERY, "core.summary": "done" }, ["core", "app"]),
      workflow("task", "app.workspace", T0, { status: "active" }),
    ]);
    assert.deepEqual(repoProgress(state), { done: 1, total: 2, current: "app" });
  });

  it("additionne les tokens de la phase par tache et par minute", () => {
    const state = play([
      { ...(phase("delivery", DELIVERY) as Extract<RunEvent, { type: "phase" }>), usage: { input: 1000, cached: 0, output: 0 } },
      workflow("usage", "core.tests", T0, { usage: { input: 10, cached: 5, output: 1 } }),
      workflow("usage", "core.tests", T0 + 30_000, { usage: { input: 10, cached: 5, output: 1 } }),
      workflow("usage", "core.code", T0 + 125_000, { usage: { input: 100, cached: 0, output: 0 } }),
    ]);
    assert.deepEqual(state.usage, { input: 1120, cached: 10, output: 2 });
    assert.equal(state.tasks.find((row) => row.key === "core.tests")?.tokens, 32);
    assert.deepEqual(usageSeries({ ...state, now: T0 + 125_000 }, 4), [0, 32, 0, 100]);
  });

  it("ajoute au total du ticket ce que les runs precedents ont depense", () => {
    const earlier = { input: 500, cached: 50, output: 5 };
    const state = play([
      { ...(phase("closing", { prose: "waiting" }) as Extract<RunEvent, { type: "phase" }>), usage: { input: 10, cached: 0, output: 1 }, earlier },
      workflow("usage", "prose", T0, { usage: { input: 20, cached: 0, output: 2 } }),
    ]);
    assert.deepEqual(state.usage, { input: 30, cached: 0, output: 3 });
    assert.deepEqual(runUsage(state), { input: 530, cached: 50, output: 8 });
  });

  it("signale la question en attente jusqu'a la reponse", () => {
    const asked = play([phase("framing", { functional: "active" }), workflow("input-request", "functional", T0)]);
    assert.equal(asked.waiting, "functional");
    assert.deepEqual([asked.journal.at(-1)?.tone, asked.journal.at(-1)?.text], ["warning", "? Grill fonctionnel attend ta reponse"]);
    const answered = reduce(reduce(asked, { type: "question", request: { id: "r1", executionId: "x", key: "functional", requestedAt: "", question: "Quelle periode ?" } }, T0), workflow("input-answer", "functional", T0), T0);
    assert.deepEqual([answered.waiting, answered.asked], [null, null]);
  });

  it("donne a chaque agent sa voie, les eclaireurs paralleles chacun la leur", () => {
    const state = play([
      phase("framing", { scope: "active" }),
      agent("scope", "scope-scout", { kind: "tool", name: "Read", input: { file_path: "src/period.js" } }, "core"),
      agent("scope", "scope-scout", { kind: "text-delta", text: "La periode " }, "app"),
      agent("scope", "scope-scout", { kind: "text-delta", text: "vit ailleurs" }, "app"),
      agent("scope", "scope-scout", { kind: "tool", name: "Bash", input: { command: "rg  -n\n clamp" } }, "core"),
    ]);
    const [core, app] = [lanesOf(state, "scope").find((lane) => lane.lane === "core"), lanesOf(state, "scope").find((lane) => lane.lane === "app")];
    assert.deepEqual(core?.tools, ["Read src/period.js", "Bash rg -n clamp"]);
    assert.equal(app?.draft, "La periode vit ailleurs");
    assert.equal(lanesOf(state, "scope")[0]?.lane, "core");

    const settled = reduce(state, agent("scope", "scope-scout", { kind: "text", text: "La periode vit ailleurs." }, "app"), T0);
    const lane = lanesOf(settled, "scope").find((entry) => entry.lane === "app");
    assert.deepEqual([lane?.text, lane?.draft], ["La periode vit ailleurs.", ""]);
  });

  it("borne ce qu'une voie retient", () => {
    const tools = Array.from({ length: LIMITS.tools + 5 }, (_, index) => agent("core.code", "developer", { kind: "tool", name: `T${index}`, input: {} }));
    const long = agent("core.code", "developer", { kind: "text", text: "x".repeat(LIMITS.laneText + 50) });
    const lane = lanesOf(play([phase("delivery", DELIVERY), ...tools, long]), "core.code")[0];
    assert.equal(lane?.tools.length, LIMITS.tools);
    assert.equal(lane?.tools.at(-1), `T${LIMITS.tools + 4}`);
    assert.equal(lane?.text.length, LIMITS.laneText);
  });

  it("garde le dernier verdict de chaque juge, et dit quand un budget deborde", () => {
    const state = play([
      phase("delivery", DELIVERY),
      { type: "gate", task: "core.code", gate: "adversaire", round: 1, verdict: "feedback", spent: 1, budget: 1, text: "C1 non tenu" },
      { type: "gate", task: "core.code", gate: "vert", round: 2, verdict: "pass", spent: 0, budget: 3, text: null },
      { type: "gate", task: "core.code", gate: "adversaire", round: 2, verdict: "feedback", spent: 2, budget: 1, text: "C1 toujours pas" },
    ]);
    assert.deepEqual(
      state.gates["core.code"]?.map((gate) => [gate.gate, gate.spent, gate.budget, gate.text]),
      [
        ["vert", 0, 3, null],
        ["adversaire", 2, 1, "C1 toujours pas"],
      ],
    );
    assert.deepEqual(
      state.journal.slice(-3).map((entry) => [entry.tone, entry.text]),
      [
        ["warning", "✗ core — convergence du code · adversaire refuse (1/1)"],
        ["success", "✓ core — convergence du code · vert"],
        ["error", "✗ core — convergence du code · adversaire refuse (2/1)"],
      ],
    );
  });

  it("dit un refus sans budget quand le checkpoint relu ne le garde pas", () => {
    const state = play([phase("delivery", DELIVERY), { type: "gate", task: "core.code", gate: "adversaire", round: 3, verdict: "feedback", spent: 3, budget: null, text: "C1 non tenu" }]);
    assert.deepEqual([state.journal.at(-1)?.tone, state.journal.at(-1)?.text], ["warning", "✗ core — convergence du code · adversaire refuse (3 refus)"]);
  });

  it("fait vivre une commande dans une seule ligne du journal, puis note son issue", () => {
    const command = (status: "start" | "progress" | "end", extra: object = {}): RunEvent => ({ type: "command", task: "core.code", label: "ut", command: "npm run test:unit", status, elapsedMs: 0, ...extra });
    const running = play([phase("delivery", DELIVERY), command("start"), command("progress", { elapsedMs: 15_000 }), command("progress", { elapsedMs: 30_000 })]);
    assert.equal(running.journal.at(-1)?.text, "$ core — convergence du code · ut : npm run test:unit (30 s)");
    assert.equal(running.commands["core.code"]?.[0]?.status, "running");

    const ended = reduce(running, command("end", { elapsedMs: 41_000, exitCode: 1, passed: false, logPath: "/logs/ut.log" }), T0);
    assert.deepEqual(
      ended.journal.slice(-2).map((entry) => entry.text),
      ["$ core — convergence du code · ut : npm run test:unit (30 s)", "✗ core — convergence du code · ut — code 1 apres 41 s · /logs/ut.log"],
    );
    assert.deepEqual(ended.commands["core.code"]?.map((run) => [run.status, run.exitCode, run.elapsedMs]), [["failed", 1, 41_000]]);
  });

  it("note chaque etape du pre-vol, et la sortie du build de l'image ligne a ligne", () => {
    const state = play([
      { type: "preflight", step: "registre", status: "ok", detail: "2 depot(s)" },
      { type: "preflight", step: "image", status: "output", detail: "#5 [3/6] RUN npm install -g" },
      { type: "preflight", step: "image", status: "fail", detail: "Image des agents absente.\nConstruis-la avec : bun redline image build" },
    ]);
    assert.deepEqual(
      state.journal.map((entry) => [entry.tone, entry.text]),
      [
        ["success", "✓ registre — 2 depot(s)"],
        ["info", "  #5 [3/6] RUN npm install -g"],
        ["error", "✗ image des agents — Image des agents absente."],
      ],
    );
  });

  it("note les actions publiques avec leur lien", () => {
    const state = play([phase("closing", { "merge-requests": "active" }), { type: "publication", task: "merge-requests", action: "merge-request", detail: "core : MR ouverte", url: "https://gitlab/mr/1" }]);
    assert.deepEqual([state.journal.at(-1)?.text, state.journal.at(-1)?.url], ["↗ core : MR ouverte", "https://gitlab/mr/1"]);
  });

  it("borne le journal", () => {
    const state = play([phase("delivery", DELIVERY), ...Array.from({ length: LIMITS.journal + 10 }, () => workflow("retry", "core.tests", T0))]);
    assert.equal(state.journal.length, LIMITS.journal);
    assert.equal(state.journal.at(-1)?.id, LIMITS.journal + 11);
  });
});
