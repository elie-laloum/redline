import * as clack from "@clack/prompts";
import { RedlineError } from "../domain/failure.ts";

export async function guarded(action: () => Promise<number | void>): Promise<void> {
  try {
    process.exitCode = (await action()) ?? 0;
  } catch (error) {
    if (error instanceof RedlineError) {
      clack.log.error(error.message);
      if (error.hint) clack.log.message(error.hint);
    } else {
      clack.log.error(error instanceof Error ? (error.stack ?? error.message) : String(error));
    }
    process.exitCode = 1;
  }
}

export const mark = { ok: "✓", warn: "!", fail: "✗" } as const;
