import { resolveBySquad, type Settings } from "./config.ts";
import { squadOf } from "./ticket.ts";

export interface Invitees {
  readonly squad: string;
  readonly emails: readonly string[];
  readonly fellBackToDefault: boolean;
}

export function inviteesFor(slack: Settings["slack"], ticketKey: string): Invitees {
  const squad = squadOf(ticketKey);
  const matched = Object.keys(slack.invitees.bySquad).some((key) => key.trim().toLowerCase() === squad.toLowerCase());
  return { squad, emails: resolveBySquad(slack.invitees, squad), fellBackToDefault: !matched };
}
