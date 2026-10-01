import assert from "node:assert/strict";
import { appendFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { afterEach, describe, it } from "bun:test";
import type { AgentObservation } from "@elie-laloum/outpost";
import { followJournal, type JournalLine, openJournal, readJournal } from "../../src/app/event-journal.ts";
import { journalFile, pathsOf } from "../../src/app/paths.ts";
import type { RunEvent } from "../../src/domain/run-events.ts";
import { temporaryDirectory } from "../helpers.ts";

let directory: ReturnType<typeof temporaryDirectory> | null = null;

afterEach(() => {
  directory?.cleanup();
  directory = null;
});

function home() {
  directory = temporaryDirectory("redline-journal-");
  return pathsOf(directory.path);
}

function agent(kind: AgentObservation["kind"], fields: object, task = "plan", lane?: string): RunEvent {
  return { type: "agent", source: { task, ...(lane ? { lane } : {}) }, role: "planner", event: { kind, pass: 1, at: "", ...fields } as AgentObservation };
}

function events(lines: readonly JournalLine[] | null): RunEvent[] {
  return (lines ?? []).flatMap((line) => ("event" in line ? [line.event] : []));
}

describe("le journal d'evenements d'un run", () => {
  it("n'existe pas pour un run qui n'en a jamais ecrit", () => {
    assert.equal(readJournal(home(), "FT-1"), null);
  });

  it("ecrit le debut de la session, chaque evenement horodate, puis son issue", () => {
    const paths = home();
    let now = 1000;
    const journal = openJournal(paths, "FT-1", () => now++);
    journal.begin(4242);
    journal.record({ type: "output", task: "ticket", value: { key: "FT-1" } });
    journal.end({ status: "cancelled" });
    journal.close();
    assert.deepEqual(readJournal(paths, "FT-1"), [
      { at: 1000, session: { pid: 4242 } },
      { at: 1001, event: { type: "output", task: "ticket", value: { key: "FT-1" } } },
      { at: 1002, outcome: { status: "cancelled" } },
    ]);
  });

  it("joint le texte d'un agent arrive par morceaux, sans le laisser doubler ce qui le suit", () => {
    const paths = home();
    const journal = openJournal(paths, "FT-1");
    journal.record(agent("text-delta", { text: "Je lis " }));
    journal.record(agent("text-delta", { text: "le scope." }, "scope", "core"));
    journal.record(agent("text-delta", { text: "le ticket." }));
    journal.record(agent("text", { text: "Je lis le ticket." }));
    journal.close();
    const written = events(readJournal(paths, "FT-1")).map((event) => (event.type === "agent" && "text" in event.event ? `${event.event.kind}@${event.source.task}:${event.event.text}` : event.type));
    assert.deepEqual(written, ["text-delta@plan:Je lis le ticket.", "text-delta@scope:le scope.", "text@plan:Je lis le ticket."]);
  });

  it("ne garde de l'agent que ce que l'ecran montre, et coupe les arguments d'un outil", () => {
    const paths = home();
    const journal = openJournal(paths, "FT-1");
    journal.record(agent("reasoning", { text: "je reflechis" }));
    journal.record(agent("tool", { name: "Write", input: { file_path: "src/a.ts", content: "x".repeat(10_000), lines: 400 } }));
    journal.close();
    const [tool] = events(readJournal(paths, "FT-1"));
    assert.ok(tool?.type === "agent" && tool.event.kind === "tool");
    const input = tool.event.input as Record<string, string>;
    assert.equal(input.file_path, "src/a.ts");
    assert.equal(input.content?.length, 401);
    assert.equal("lines" in input, false);
  });

  it("n'ecrit qu'une fois la valeur d'une tache que chaque reprise du workflow rend a nouveau", () => {
    const paths = home();
    const journal = openJournal(paths, "FT-1");
    journal.record({ type: "output", task: "ticket", value: { key: "FT-1" } });
    journal.record({ type: "output", task: "ticket", value: { key: "FT-1" } });
    journal.record({ type: "output", task: "ticket", value: { key: "FT-2" } });
    journal.close();
    assert.equal(events(readJournal(paths, "FT-1")).length, 2);
  });

  it("se lit au fil de l'eau, une ligne encore en cours d'ecriture attendant la lecture suivante", () => {
    const paths = home();
    const file = journalFile(paths, "FT-1");
    const reader = followJournal(paths, "FT-1");
    assert.deepEqual(reader.read(), []);
    mkdirSync(dirname(file), { recursive: true });
    const line = JSON.stringify({ at: 1, event: { type: "output", task: "ticket", value: "é" } });
    appendFileSync(file, `${JSON.stringify({ at: 0, session: { pid: 1 } })}\n${line.slice(0, 20)}`);
    assert.deepEqual(reader.read(), [{ at: 0, session: { pid: 1 } }]);
    appendFileSync(file, `${line.slice(20)}\n`);
    assert.deepEqual(reader.read(), [{ at: 1, event: { type: "output", task: "ticket", value: "é" } }]);
    assert.deepEqual(reader.read(), []);
  });
});
