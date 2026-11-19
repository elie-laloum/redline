import { fail } from "../domain/failure.ts";
import { type Ledger, recordEvent } from "./ledger.ts";

/** The notes given to `resume --note`, by task: every round of the task reads its note until it is cleared. */
export function notesOf(ledger: Ledger): readonly { readonly task: string; readonly note: string }[] {
  return Object.entries(ledger.delivery.seeds).map(([task, note]) => ({ task, note }));
}

/** Removes the note of one task, or every note; a key removed rather than set to null, which the ledger refuses. */
export function clearNotes(ledger: Ledger, task: string | null): Ledger {
  if (ledger.active) fail(`Un run de ${ledger.key} est en cours (pid ${ledger.active.pid}).`, "Attends sa fin, ou interromps-le, avant de toucher a ses notes.");
  const seeds = { ...ledger.delivery.seeds };
  if (task === null) {
    for (const key of Object.keys(seeds)) delete seeds[key];
  } else {
    if (!(task in seeds)) fail(`Aucune note sur ${task}.`, `Taches avec une note : ${Object.keys(seeds).join(", ") || "aucune"}.`);
    delete seeds[task];
  }
  return recordEvent({ ...ledger, delivery: { ...ledger.delivery, seeds } }, task === null ? "notes effacees" : `note effacee sur ${task}`);
}
