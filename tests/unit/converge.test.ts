import assert from "node:assert/strict";
import { afterAll, describe, it } from "bun:test";
import { createLocalTransport, createWorkflowCheckpointStore, defineWorkflow, type WorkflowJson } from "@elie-laloum/outpost";
import { parseEscalation } from "../../src/domain/escalation.ts";
import { type Carry, converge, type Gate, type Verdict } from "../../src/workflow/converge.ts";
import { temporaryDirectory } from "../helpers.ts";

const storage = temporaryDirectory();
afterAll(() => storage.cleanup());

function scriptedGate(name: string, budget: number, verdicts: Verdict[]): Gate<WorkflowJson> & { calls: number } {
  const gate = {
    name,
    budget,
    calls: 0,
    async judge() {
      gate.calls += 1;
      return verdicts.shift() ?? { kind: "pass" as const };
    },
  };
  return gate;
}

async function execute(gates: Gate<WorkflowJson>[], seed: string | null = null) {
  const carries: Carry[] = [];
  const task = converge({
    key: "repo.tests",
    seed: () => seed,
    make: async (_context, carry) => {
      carries.push(carry);
      return { round: carry.round };
    },
    gates,
  });
  const result = await defineWorkflow("converge", [task]).start();
  return { result, task, carries };
}

describe("converge", () => {
  it("renvoie au faiseur le retour du juge qui a refuse, puis s'arrete au premier passage complet", async () => {
    const adversary = scriptedGate("adversary", 3, [{ kind: "feedback", text: "T2 ne verifie rien" }]);
    const red = scriptedGate("red", 3, [{ kind: "feedback", text: "rouge pour une erreur d'import" }]);
    const { result, task, carries } = await execute([adversary, red]);
    result.unwrap();
    assert.deepEqual(carries.map((carry) => carry.feedback?.text ?? null), [null, "T2 ne verifie rien", "rouge pour une erreur d'import"]);
    assert.deepEqual(result.value(task).carry.spent, { adversary: 1, red: 1 });
  });

  it("transmet la note humaine au premier tour", async () => {
    const { carries } = await execute([scriptedGate("adversary", 1, [])], "garde le contrat v1");
    assert.deepEqual(carries[0]?.feedback, { gate: "humain", text: "garde le contrat v1" });
  });

  it("escalade quand un juge depasse son propre budget, sans toucher a celui des autres", async () => {
    const adversary = scriptedGate("adversary", 1, [{ kind: "feedback", text: "a" }, { kind: "feedback", text: "b" }]);
    const red = scriptedGate("red", 5, []);
    const { result } = await execute([adversary, red]);
    assert.equal(result.status, "failed");
    const escalation = parseEscalation(String(result.errors[0]));
    assert.equal(escalation?.kind, "convergence");
    assert.equal(escalation?.task, "repo.tests/adversary");
    assert.match(escalation?.detail ?? "", /budget de 1/);
  });

  it("n'atteint jamais l'epuisement d'outpost : le budget parle avant", async () => {
    const fail = (text: string): Verdict => ({ kind: "feedback", text });
    const a = scriptedGate("a", 2, [fail("a1"), fail("a2")]);
    const b = scriptedGate("b", 1, [fail("b1")]);
    a.judge = async () => {
      a.calls += 1;
      return fail(`a${a.calls}`);
    };
    const { result } = await execute([b, a]);
    assert.equal(parseEscalation(String(result.errors[0]))?.kind, "convergence");
    assert.doesNotMatch(String(result.errors[0]), /exhausted/i);
  });

  it("garde la memoire d'un juge d'un tour a l'autre", async () => {
    let seen: WorkflowJson | undefined;
    const counting: Gate<WorkflowJson> = {
      name: "disputes",
      budget: 3,
      async judge(_context, _candidate, carry) {
        const count = Number(carry.memo.disputes ?? 0) + 1;
        seen = carry.memo.disputes;
        return count < 3 ? { kind: "feedback", text: `dispute ${count}`, memo: count } : { kind: "pass" };
      },
    };
    const { result } = await execute([counting]);
    result.unwrap();
    assert.equal(seen, 2);
  });

  it("escalade une panne d'environnement sans debiter, et la reprise ne rejoue que le juge", async () => {
    const store = createWorkflowCheckpointStore({ transporter: createLocalTransport({ directory: storage.path }) });
    let makes = 0;
    let broken = true;
    const environment: Gate<WorkflowJson> = {
      name: "red",
      budget: 1,
      async judge() {
        return broken ? { kind: "environment", text: "docker ne repond pas" } : { kind: "pass" };
      },
    };
    const task = converge({
      key: "repo.tests",
      make: async () => {
        makes += 1;
        return { made: makes };
      },
      gates: [environment],
    });
    const workflow = defineWorkflow("converge-reprise", [task]);
    const checkpoint = { store, runId: "FT-1/delivery/1", version: "1" };
    const first = await workflow.start({ checkpoint });
    assert.equal(parseEscalation(String(first.errors[0]))?.kind, "environment");
    broken = false;
    const second = await workflow.start({ checkpoint: { ...checkpoint, resume: "retry-incomplete" } });
    second.unwrap();
    assert.equal(makes, 1);
    assert.deepEqual(second.value(task).carry.spent, {});
  });
});
