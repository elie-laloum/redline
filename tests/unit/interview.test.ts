import assert from "node:assert/strict";
import { afterAll, describe, it } from "bun:test";
import {
  createLocalTransport,
  createTaskCacheStore,
  createWorkflowCheckpointStore,
  defineWorkflow,
  type WorkflowInputRequest,
  type WorkflowResult,
} from "@elie-laloum/outpost";
import { parseEscalation } from "../../src/domain/escalation.ts";
import { defineInterview, type Exchange, type Question, type Turn } from "../../src/workflow/interview.ts";
import { temporaryDirectory } from "../helpers.ts";

const storage = temporaryDirectory();
const transporter = createLocalTransport({ directory: storage.path });
const store = createWorkflowCheckpointStore({ transporter });
const cache = createTaskCacheStore({ transporter });
afterAll(() => storage.cleanup());

const question = (id: string, options = ["oui", "non"]): Question => ({ id, header: `Sujet ${id}`, text: `Faut-il ${id} ?`, options });
const answer = (request: WorkflowInputRequest, value: string) => ({ executionId: request.executionId, key: request.key, requestId: request.id, actor: "humain", value });

function interview(runId: string, think: (transcript: readonly Exchange[], turn: number) => Turn<{ decided: string }>, maxTurns = 3, memoKey?: string) {
  const calls: number[] = [];
  const task = defineInterview({
    key: "functional",
    workflow: "redline.framing",
    title: "Grill fonctionnel",
    actors: ["humain"],
    maxTurns,
    think: async (_context, transcript, turn) => {
      calls.push(turn);
      return think(transcript, turn);
    },
    memo: memoKey ? { store: cache, version: "1", key: () => memoKey } : undefined,
  });
  const workflow = defineWorkflow("redline.framing", [task]);
  const checkpoint = { store, runId, version: "1" };
  return {
    task,
    calls,
    start: (answers: ReturnType<typeof answer>[] = [], resume = false): Promise<WorkflowResult> =>
      workflow.start({ checkpoint: resume ? { ...checkpoint, resume: "retry-incomplete" } : checkpoint, ...(answers.length ? { answers } : {}) }),
  };
}

const twoThenDone = (transcript: readonly Exchange[]): Turn<{ decided: string }> =>
  transcript.length < 2 ? { ask: [question("filtrer"), question("trier", ["asc", "desc", "asc"])] } : { done: { decided: transcript.map((e) => e.answer).join(",") } };

describe("une interview durable", () => {
  it("pose un lot question par question, puis rend le transcript complet", async () => {
    const run = interview("FT-1/framing/1", twoThenDone);
    let result = await run.start();
    assert.equal(result.status, "waiting-input");
    assert.match(result.inputRequests[0]?.question ?? "", /Grill fonctionnel · 1\/2 — Sujet filtrer/);
    assert.deepEqual(result.inputRequests[0]?.choices, ["oui", "non"]);

    result = await run.start([answer(result.inputRequests[0]!, "oui")]);
    assert.deepEqual(result.inputRequests[0]?.choices, ["asc", "desc"]);
    result = await run.start([answer(result.inputRequests[0]!, "desc")]);
    result.unwrap();
    assert.deepEqual(result.value(run.task).output, { decided: "oui,desc" });
    assert.deepEqual(result.value(run.task).transcript.map((e) => e.question.id), ["filtrer", "trier"]);
    assert.deepEqual(run.calls, [1, 2]);
  });

  it("n'enregistre jamais deux fois la meme reponse quand le process repart", async () => {
    const run = interview("FT-2/framing/1", twoThenDone);
    const first = await run.start();
    const second = await run.start([answer(first.inputRequests[0]!, "non")]);
    const again = await run.start();
    assert.equal(again.status, "waiting-input");
    assert.equal(again.inputRequests[0]?.id, second.inputRequests[0]?.id);
    const done = await run.start([answer(again.inputRequests[0]!, "asc")]);
    assert.deepEqual(done.value(run.task).output, { decided: "non,asc" });
    assert.deepEqual(run.calls, [1, 2]);
  });

  it("se souvient d'une interview deja menee, meme sous un autre run", async () => {
    const first = interview("FT-3/framing/1", twoThenDone, 3, "FT-3|aucune-note");
    let result = await first.start();
    result = await first.start([answer(result.inputRequests[0]!, "oui")]);
    await first.start([answer(result.inputRequests[0]!, "asc")]);

    const reopened = interview("FT-3/framing/2", twoThenDone, 3, "FT-3|aucune-note");
    const replay = await reopened.start();
    replay.unwrap();
    assert.deepEqual(replay.value(reopened.task).output, { decided: "oui,asc" });
    assert.deepEqual(reopened.calls, []);
  });

  it("escalade un grill qui ne conclut pas dans son nombre de lots", async () => {
    const run = interview("FT-4/framing/1", () => ({ ask: [question("encore")] }), 2);
    let result = await run.start();
    result = await run.start([answer(result.inputRequests[0]!, "oui")]);
    result = await run.start([answer(result.inputRequests[0]!, "oui")]);
    assert.equal(result.status, "failed");
    assert.equal(parseEscalation(String(result.errors[0]))?.kind, "convergence");
  });

  it("laisse repondre librement quand une question n'a pas de vrai choix", async () => {
    const run = interview("FT-5/framing/1", (transcript) => (transcript.length ? { done: { decided: transcript[0]!.answer } } : { ask: [question("nommer", ["unique"])] }));
    const result = await run.start();
    assert.equal(result.inputRequests[0]?.choices, undefined);
    assert.equal(result.inputRequests[0]?.allowFreeText, true);
  });
});

