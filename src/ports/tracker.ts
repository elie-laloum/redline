import type { DescriptionEdit } from "../domain/description-edits.ts";
import type { TicketSnapshot } from "../domain/ticket.ts";

export interface EditedPassages {
  readonly applied: number;
  /** Already rewritten, by an earlier run. */
  readonly present: number;
  readonly missed: readonly DescriptionEdit[];
}

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
  /** Rewrites only the quoted passages of the ticket's description, everything else left as it is. */
  editDescription(key: string, edits: readonly DescriptionEdit[]): Promise<EditedPassages>;
  comments(key: string): Promise<readonly string[]>;
}
