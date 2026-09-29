import { defineTask, type Task } from "@elie-laloum/outpost";
import type { TicketSnapshot } from "../../domain/ticket.ts";
import type { RunContext } from "../run.ts";

export function ticketTask(run: RunContext): Task<TicketSnapshot> {
  return defineTask({
    key: "ticket",
    retry: { attempts: 2, delayMs: 2_000 },
    perform: () => run.app.services.tracker.getTicket(run.ledger.key),
  });
}
