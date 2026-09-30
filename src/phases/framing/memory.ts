import { defineTask, type Task, type TaskContext } from "@elie-laloum/outpost";
import { renderNotes, type SelectionFocus, selectNotes } from "../../domain/memory-selection.ts";
import type { RunContext } from "../run.ts";

export interface MemoryBrief {
  readonly rendered: string;
  readonly paths: readonly string[];
}

export function memoryTask(run: RunContext, key: string, after: readonly Task[], focus: (context: TaskContext) => SelectionFocus): Task<MemoryBrief> {
  return defineTask({
    key,
    after,
    perform(context) {
      const notes = selectNotes(run.app.memory().list(), focus(context), run.app.configuration.settings.memory.selection);
      return { rendered: renderNotes(notes), paths: notes.map((note) => note.path) };
    },
  });
}
