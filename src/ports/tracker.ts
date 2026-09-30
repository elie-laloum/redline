import type { TicketSnapshot } from "../domain/ticket.ts";

export interface TrackerIdentity {
  readonly accountId: string;
  readonly email: string;
}

export interface Tracker {
  getTicket(key: string): Promise<TicketSnapshot>;
  /** The account behind the credentials, or null when the tracker refuses them. */
  whoami(): Promise<TrackerIdentity | null>;
  transition(key: string, target: string): Promise<{ readonly id: string; readonly name: string }>;
  comment(key: string, text: string): Promise<{ readonly id: string }>;
  comments(key: string): Promise<readonly string[]>;
}
