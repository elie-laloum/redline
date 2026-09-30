import { collectUrls, extractAcceptanceCriteria, flattenDocument, splitCriteria, toDocument } from "../domain/acceptance.ts";
import { fail } from "../domain/failure.ts";
import { squadOf } from "../domain/ticket.ts";
import type { Tracker, TrackerIdentity } from "../ports/tracker.ts";
import { request } from "./http.ts";

export interface JiraCredentials {
  readonly site: string;
  readonly email: string;
  readonly token: string;
}

type IssuePayload = {
  readonly key?: string;
  readonly fields?: {
    readonly summary?: string;
    readonly description?: unknown;
    readonly status?: { readonly name?: string };
    readonly issuetype?: { readonly name?: string };
    readonly labels?: readonly string[];
    readonly attachment?: readonly { readonly content?: string }[];
  };
};

export function createJira(credentials: JiraCredentials): Tracker {
  const site = credentials.site.replace(/\/+$/, "");
  const base = `${site}/rest/api/3`;
  const headers = { authorization: `Basic ${Buffer.from(`${credentials.email}:${credentials.token}`).toString("base64")}` };
  const issue = (key: string, suffix = "") => `${base}/issue/${encodeURIComponent(key)}${suffix}`;

  const transitions = async (key: string) => {
    const { data } = await request<{ transitions?: { id: string; to?: { name?: string } }[] }>(issue(key, "/transitions"), { headers });
    return (data?.transitions ?? []).map((t) => ({ id: t.id, name: t.to?.name ?? "" }));
  };

  const whoami = async (): Promise<TrackerIdentity | null> => {
    const { status, data } = await request<{ accountId?: string; emailAddress?: string }>(`${base}/myself`, { headers, allow: [401, 403] });
    if (status !== 200 || !data?.accountId) return null;
    return { accountId: data.accountId, email: data.emailAddress ?? credentials.email };
  };

  // Jira Cloud answers 404 both for a missing issue and for credentials it silently treats as
  // anonymous: /myself tells the two apart.
  const unreachable = async (key: string, status: number): Promise<never> => {
    const identity = status === 401 ? null : await whoami();
    if (!identity) {
      fail(`Jira refuse les identifiants de ${credentials.email}.`, "Verifie JIRA_EMAIL et JIRA_API_TOKEN dans le .env de redline : le jeton est peut-etre expire ou revoque.");
    }
    return fail(`Ticket Jira ${key} introuvable, ou invisible pour ${identity.email}.`, "Verifie la cle, et que ce compte a acces au projet.");
  };

  return {
    whoami,

    async getTicket(key) {
      const { status, data } = await request<IssuePayload>(
        issue(key, "?fields=summary,description,status,issuetype,labels,attachment"),
        { headers, allow: [401, 403, 404] },
      );
      if (status !== 200 || !data?.key) return unreachable(key, status);
      const title = data.fields?.summary ?? "";
      const description = flattenDocument(data.fields?.description);
      return {
        key: data.key,
        squad: squadOf(data.key),
        title,
        description,
        criteria: splitCriteria(extractAcceptanceCriteria(description), title),
        issueType: data.fields?.issuetype?.name ?? "Task",
        status: data.fields?.status?.name ?? "",
        url: `${site}/browse/${data.key}`,
        labels: data.fields?.labels ?? [],
        links: collectUrls(description, data.fields?.attachment ?? []),
      };
    },

    async transition(key, target) {
      const available = await transitions(key);
      const wanted = available.find((t) => t.name.trim().toLowerCase() === target.trim().toLowerCase());
      if (!wanted) {
        fail(`Statut « ${target} » inatteignable depuis l'etat actuel de ${key}.`, `Transitions possibles : ${available.map((t) => t.name).join(", ") || "aucune"}`);
      }
      await request(issue(key, "/transitions"), { method: "POST", headers, body: { transition: { id: wanted.id } } });
      return wanted;
    },

    async comment(key, text) {
      const { data } = await request<{ id: string }>(issue(key, "/comment"), { method: "POST", headers, body: { body: toDocument(text) } });
      return { id: String(data?.id ?? "") };
    },

    async comments(key) {
      const { data } = await request<{ comments?: { body?: unknown }[] }>(issue(key, "/comment?maxResults=100"), { headers, allow: [404] });
      return (data?.comments ?? []).map((comment) => flattenDocument(comment.body));
    },
  };
}
