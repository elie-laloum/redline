import { describeError } from "../domain/failure.ts";
import type { Chat } from "../ports/chat.ts";
import type { Design } from "../ports/design.ts";
import type { Forge } from "../ports/forge.ts";
import type { Tracker } from "../ports/tracker.ts";

/** What a service said of the credentials it was given. */
export interface Connection {
  readonly status: "ok" | "warn" | "fail";
  readonly detail: string;
}

export const GITLAB_SCOPES = ["api", "write_repository"] as const;
export const SLACK_SCOPES = ["groups:write", "groups:write.invites", "bookmarks:write", "chat:write", "users:read.email"] as const;

export function testTracker(tracker: Tracker): Promise<Connection> {
  return probe(async () => {
    const identity = await tracker.whoami();
    return identity ? ok(`connecte en tant que ${identity.email}`) : refused("verifie JIRA_SITE_URL, JIRA_EMAIL et JIRA_API_TOKEN");
  });
}

export function testForge(forge: Forge): Promise<Connection> {
  return probe(async () => {
    const identity = await forge.whoami();
    if (!identity) return refused("verifie GITLAB_HOST et GITLAB_TOKEN");
    const missing = missingScopes(identity.scopes, GITLAB_SCOPES);
    if (missing.length > 0) return { status: "fail", detail: `@${identity.username} : portees manquantes ${missing.join(", ")}` };
    return identity.scopes ? ok(`connecte en tant que @${identity.username}`) : { status: "warn", detail: `@${identity.username} : portees inconnues, ce n'est pas un jeton personnel` };
  });
}

/** Every action must appear under the human's name: a bot token, xoxb-, would post as an app. */
export function testChat(chat: Chat, token: string): Promise<Connection> {
  return probe(async () => {
    if (!token.startsWith("xoxp-")) return { status: "fail", detail: "il faut un jeton utilisateur xoxp-, pas un jeton de bot" };
    const identity = await chat.whoami();
    if (!identity) return refused("verifie SLACK_USER_TOKEN");
    const missing = missingScopes(identity.scopes, SLACK_SCOPES);
    if (missing.length > 0) return { status: "fail", detail: `${identity.user} : portees manquantes ${missing.join(", ")}` };
    return ok(`connecte en tant que ${identity.user} sur ${identity.team}`);
  });
}

export function testDesign(design: Design): Promise<Connection> {
  return probe(async () => {
    const identity = await design.whoami();
    return identity ? ok(`connecte en tant que ${identity.handle}`) : refused("verifie FIGMA_TOKEN");
  });
}

/** The wanted scopes the service does not grant; none when it does not say. */
export function missingScopes(granted: readonly string[] | null, wanted: readonly string[]): string[] {
  return granted ? wanted.filter((scope) => !granted.includes(scope)) : [];
}

async function probe(test: () => Promise<Connection>): Promise<Connection> {
  try {
    return await test();
  } catch (error) {
    return { status: "fail", detail: describeError(error) };
  }
}

function ok(detail: string): Connection {
  return { status: "ok", detail };
}

function refused(hint: string): Connection {
  return { status: "fail", detail: `identifiants refuses : ${hint}` };
}
