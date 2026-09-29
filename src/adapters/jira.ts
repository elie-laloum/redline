import { collectUrls, extractAcceptanceCriteria, flattenDocument, splitCriteria, toDocument } from "../domain/acceptance.ts";
import { fail } from "../domain/failure.ts";
import { squadOf } from "../domain/ticket.ts";
import type { Tracker } from "../ports/tracker.ts";
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

  return {
    async getTicket(key) {
      const { status, data } = await request<IssuePayload>(
        issue(key, "?fields=summary,description,status,issuetype,labels,attachment"),
        { headers, allow: [404] },
      );
      if (status === 404 || !data?.key) fail(`Ticket Jira introuvable ou inaccessible : ${key}.`, "Verifie la cle et les droits du jeton.");
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
