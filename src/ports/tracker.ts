import type { TicketSnapshot } from "../domain/ticket.ts";

export interface Tracker {
  getTicket(key: string): Promise<TicketSnapshot>;
  transition(key: string, target: string): Promise<{ readonly id: string; readonly name: string }>;
  comment(key: string, text: string): Promise<{ readonly id: string }>;
  comments(key: string): Promise<readonly string[]>;
}
