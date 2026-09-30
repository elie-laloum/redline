import { defineTask, type Task } from "@elie-laloum/outpost";
import type { RelatedTicket, TicketReference, TicketSnapshot } from "../../domain/ticket.ts";
import type { Tracker } from "../../ports/tracker.ts";
import type { RunContext } from "../run.ts";

const RELATED_DESCRIPTION_CHARS = 4_000;

export function ticketTask(run: RunContext): Task<TicketSnapshot> {
  return defineTask({
    key: "ticket",
    retry: { attempts: 2, delayMs: 2_000 },
    perform: async () => {
      const { tracker } = run.app.services;
      const ticket = await tracker.getTicket(run.ledger.key);
      return { ...ticket, related: await Promise.all(ticket.references.map((reference) => readRelated(tracker, reference))) };
    },
  });
}

/** A related ticket is context: one that cannot be read is named as such, never a reason to stop. */
async function readRelated(tracker: Tracker, reference: TicketReference): Promise<RelatedTicket> {
  try {
    const ticket = await tracker.getTicket(reference.key);
    const description = ticket.description.trim();
    return {
      ...reference,
      title: ticket.title,
      issueType: ticket.issueType,
      status: ticket.status,
      url: ticket.url,
      description: description.length > RELATED_DESCRIPTION_CHARS ? `${description.slice(0, RELATED_DESCRIPTION_CHARS)}\n(… tronque)` : description,
    };
  } catch (error) {
    return { ...reference, unavailable: error instanceof Error ? error.message : String(error) };
  }
}
