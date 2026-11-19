import * as clack from "@clack/prompts";
import { createContext } from "../../app/context.ts";
import { readLedger, updateLedger } from "../../app/ledger.ts";
import { clearNotes, notesOf } from "../../app/notes.ts";
import { fail } from "../../domain/failure.ts";
import { REDLINE } from "../../domain/invocation.ts";
import { normalizeKey } from "../../domain/ticket.ts";

export function noteCommand(input: string, task: string | undefined, options: { clear?: boolean }): number {
  const app = createContext();
  const key = normalizeKey(input);
  if (options.clear) {
    const cleared = updateLedger(app.paths, key, (ledger) => clearNotes(ledger, task ?? null));
    clack.log.success(task ? `Note effacee sur ${task}.` : "Notes effacees.");
    if (notesOf(cleared).length === 0) clack.log.info("La prochaine reprise ne transmet plus aucune note.");
    return 0;
  }
  const ledger = readLedger(app.paths, key) ?? fail(`Aucun run pour ${key}.`, `Lance-le avec : ${REDLINE} start ${key}`);
  const notes = notesOf(ledger).filter((entry) => !task || entry.task === task);
  if (notes.length === 0) clack.log.info(task ? `Aucune note sur ${task}.` : "Aucune note.");
  for (const entry of notes) clack.log.message(`${entry.task}\n${entry.note}`);
  for (const ruling of ledger.delivery.rulings.filter((entry) => !task || entry.task === task)) {
    clack.log.message(`${ruling.task} — arbitrage sur ${ruling.lines.map((line) => line.id).join(", ")}\n${ruling.ruling}`);
  }
  if (notes.length) clack.log.info(`Pour en effacer une : ${REDLINE} note ${key} <tache> --clear`);
  return 0;
}
