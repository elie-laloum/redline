import { createServer, type Server } from "node:http";

/**
 * Les faux services externes.
 *
 * Tous les effets de bord externes passent deja par des tools : il suffit donc
 * de substituer ce que ces tools appellent, sans toucher a un seul agent. C'est
 * le benefice direct de la regle « toute action constante est un tool ».
 *
 * Ce qui n'est PAS substitue ici : git. Les faux repos sont de vrais depots avec
 * un vrai remote bare. Mocker git reviendrait a ne plus tester la partie la plus
 * fragile du systeme.
 */

export interface FakeService {
  readonly url: string;
  close(): Promise<void>;
}

type Handler = (
  method: string,
  path: string,
  query: URLSearchParams,
  body: any,
) => { status?: number; body: unknown } | undefined;

async function serve(handler: Handler): Promise<FakeService & { server: Server }> {
  const server = createServer((request, response) => {
    const url = new URL(request.url ?? "/", "http://localhost");
    const chunks: Buffer[] = [];
    request.on("data", (chunk: Buffer) => chunks.push(chunk));
    request.on("end", () => {
      const raw = Buffer.concat(chunks).toString();
      let body: any = null;
      if (raw) {
        try {
          body = JSON.parse(raw);
        } catch {
          body = Object.fromEntries(new URLSearchParams(raw));
        }
      }
      const result = handler(request.method ?? "GET", url.pathname, url.searchParams, body);
      const status = result?.status ?? (result ? 200 : 404);
      response.writeHead(status, { "content-type": "application/json" });
      response.end(JSON.stringify(result?.body ?? { error: `pas de route pour ${request.method} ${url.pathname}` }));
    });
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;

  return {
    server,
    url: `http://127.0.0.1:${port}`,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

// ------------------------------------------------------------------ Jira ----

export interface FakeJira extends FakeService {
  readonly issues: Map<string, { key: string; summary: string; status: string; issueType: string; description: string }>;
  readonly comments: { key: string; body: string }[];
  readonly transitions: { key: string; to: string }[];
  /** Statuts accessibles depuis l'etat courant. Scriptable par scenario. */
  available: string[];
}

export async function fakeJira(
  seed: { key: string; summary: string; status?: string; issueType?: string; description?: string }[],
): Promise<FakeJira> {
  const issues = new Map(
    seed.map((issue) => [
      issue.key,
      {
        key: issue.key,
        summary: issue.summary,
        status: issue.status ?? "READY TO DEV",
        issueType: issue.issueType ?? "Story",
        description: issue.description ?? "",
      },
    ]),
  );
  const comments: { key: string; body: string }[] = [];
  const transitions: { key: string; to: string }[] = [];
  const state = { available: ["VALIDATION", "En cours"] };

  const service = await serve((method, path, _query, body) => {
    const issueMatch = /^\/rest\/api\/3\/issue\/([^/]+)$/.exec(path);
    if (issueMatch && method === "GET") {
      const issue = issues.get(decodeURIComponent(issueMatch[1] ?? ""));
      if (!issue) return { status: 404, body: { errorMessages: ["Issue does not exist"] } };
      return {
        body: {
          key: issue.key,
          fields: {
            summary: issue.summary,
            description: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: issue.description }] }] },
            status: { name: issue.status },
            issuetype: { name: issue.issueType },
            labels: [],
            attachment: [],
          },
        },
      };
    }

    const transitionsMatch = /^\/rest\/api\/3\/issue\/([^/]+)\/transitions$/.exec(path);
    if (transitionsMatch) {
      const key = decodeURIComponent(transitionsMatch[1] ?? "");
      if (method === "GET") {
        return { body: { transitions: state.available.map((name, index) => ({ id: String(index + 1), to: { name } })) } };
      }
      const chosen = state.available[Number(body?.transition?.id ?? 1) - 1];
      const issue = issues.get(key);
      if (issue && chosen) issue.status = chosen;
      transitions.push({ key, to: chosen ?? "" });
      return { status: 204, body: {} };
    }

    const commentMatch = /^\/rest\/api\/3\/issue\/([^/]+)\/comment$/.exec(path);
    if (commentMatch && method === "POST") {
      const text = JSON.stringify(body?.body ?? "");
      comments.push({ key: decodeURIComponent(commentMatch[1] ?? ""), body: text });
      return { body: { id: String(comments.length) } };
    }

    return undefined;
  });

  return { ...service, issues, comments, transitions, get available() { return state.available; }, set available(value: string[]) { state.available = value; } };
}

// ----------------------------------------------------------------- Slack ----

export interface FakeSlack extends FakeService {
  readonly channels: { id: string; name: string; isPrivate: boolean }[];
  readonly invited: { channel: string; users: string[] }[];
  readonly messages: { channel: string; text: string }[];
  readonly bookmarks: { channel: string; title: string; link: string }[];
  /** Adresses connues de Slack. Une adresse absente n'a pas de compte. */
  readonly knownUsers: Map<string, string>;
}

export async function fakeSlack(knownUsers: Record<string, string> = {}): Promise<FakeSlack> {
  const channels: { id: string; name: string; isPrivate: boolean }[] = [];
  const invited: { channel: string; users: string[] }[] = [];
  const messages: { channel: string; text: string }[] = [];
  const bookmarks: { channel: string; title: string; link: string }[] = [];
  const users = new Map(Object.entries(knownUsers));

  const service = await serve((method, path, query, body) => {
    switch (path) {
      case "/conversations.list":
        return { body: { ok: true, channels } };
      case "/conversations.create": {
        const name = String(body?.name ?? "");
        const existing = channels.find((channel) => channel.name === name);
        if (existing) return { body: { ok: true, channel: existing } };
        const channel = { id: `C${channels.length + 1}`, name, isPrivate: Boolean(body?.is_private) };
        channels.push(channel);
        return { body: { ok: true, channel } };
      }
      case "/users.lookupByEmail": {
        const email = query.get("email") ?? String(body?.email ?? "");
        const id = users.get(email);
        return id ? { body: { ok: true, user: { id } } } : { body: { ok: false, error: "users_not_found" } };
      }
      case "/conversations.invite":
        invited.push({ channel: String(body?.channel), users: String(body?.users ?? "").split(",").filter(Boolean) });
        return { body: { ok: true } };
      case "/chat.postMessage":
        messages.push({ channel: String(body?.channel), text: String(body?.text ?? "") });
        return { body: { ok: true, ts: `${Date.now()}.000` } };
      case "/bookmarks.add":
        bookmarks.push({ channel: String(body?.channel_id), title: String(body?.title), link: String(body?.link) });
        return { body: { ok: true } };
      default:
        return method === "POST" ? { body: { ok: false, error: `unknown_method` } } : undefined;
    }
  });

  return { ...service, channels, invited, messages, bookmarks, knownUsers: users };
}

// ---------------------------------------------------------------- GitLab ----

export interface FakeGitLab extends FakeService {
  readonly mergeRequests: { project: string; iid: number; title: string; description: string; source: string; target: string; url: string }[];
  readonly notes: { iid: number; body: string }[];
  readonly tags: Map<string, string[]>;
  /** Verdict scriptable du pipeline, par ref. */
  readonly pipelineVerdicts: Map<string, { jobs: { name: string; status: string }[] }>;
  /** Nombre d'appels au suivi de pipeline : sert a verifier qu'on a attendu. */
  pipelinePolls: number;
}

export async function fakeGitLab(): Promise<FakeGitLab> {
  const mergeRequests: FakeGitLab["mergeRequests"] = [];
  const notes: { iid: number; body: string }[] = [];
  const tags = new Map<string, string[]>();
  const pipelineVerdicts = new Map<string, { jobs: { name: string; status: string }[] }>();
  const counters = { polls: 0 };

  const service = await serve((method, path, query, body) => {
    const projectMatch = /^\/api\/v4\/projects\/([^/]+)(\/.*)?$/.exec(path);
    if (!projectMatch) return undefined;
    const project = decodeURIComponent(projectMatch[1] ?? "");
    const rest = projectMatch[2] ?? "";

    if (rest === "/merge_requests" && method === "GET") {
      const source = query.get("source_branch");
      return { body: mergeRequests.filter((mr) => mr.project === project && (!source || mr.source === source)) };
    }
    if (rest === "/merge_requests" && method === "POST") {
      const iid = mergeRequests.length + 1;
      const mr = {
        project,
        iid,
        title: String(body?.title ?? ""),
        description: String(body?.description ?? ""),
        source: String(body?.source_branch ?? ""),
        target: String(body?.target_branch ?? ""),
        url: `https://gitlab.test/${project}/-/merge_requests/${iid}`,
      };
      mergeRequests.push(mr);
      return { body: { ...mr, web_url: mr.url, draft: mr.title.startsWith("Draft: ") } };
    }

    const mrMatch = /^\/merge_requests\/(\d+)$/.exec(rest);
    if (mrMatch) {
      const iid = Number(mrMatch[1]);
      const mr = mergeRequests.find((candidate) => candidate.iid === iid);
      if (!mr) return { status: 404, body: { message: "404 Not found" } };
      if (method === "PUT") {
        if (body?.title) mr.title = String(body.title);
        if (body?.description) mr.description = String(body.description);
      }
      return { body: { ...mr, web_url: mr.url, draft: mr.title.startsWith("Draft: ") } };
    }

    const notesMatch = /^\/merge_requests\/(\d+)\/notes$/.exec(rest);
    if (notesMatch) {
      const iid = Number(notesMatch[1]);
      if (method === "POST") {
        notes.push({ iid, body: String(body?.body ?? "") });
        return { body: { id: notes.length } };
      }
      return { body: notes.filter((note) => note.iid === iid) };
    }

    if (rest === "/repository/tags") {
      const existing = tags.get(project) ?? [];
      if (method === "POST") {
        existing.push(String(body?.tag_name ?? ""));
        tags.set(project, existing);
        return { body: { name: body?.tag_name } };
      }
      return { body: existing.map((name) => ({ name })) };
    }

    const branchMatch = /^\/repository\/branches\/(.+)$/.exec(rest);
    if (branchMatch) return { body: { name: decodeURIComponent(branchMatch[1] ?? "") } };

    if (rest === "/pipelines") {
      counters.polls += 1;
      const ref = query.get("ref") ?? "";
      const verdict = pipelineVerdicts.get(ref);
      if (!verdict) return { body: [] };
      return { body: [{ id: 1, status: "running", ref, sha: "deadbee", web_url: `https://gitlab.test/${project}/-/pipelines/1` }] };
    }

    const jobsMatch = /^\/pipelines\/(\d+)\/jobs$/.exec(rest);
    if (jobsMatch) {
      const ref = [...pipelineVerdicts.keys()].at(-1) ?? "";
      const verdict = pipelineVerdicts.get(ref);
      return { body: (verdict?.jobs ?? []).map((job, index) => ({ id: index, ...job, web_url: "https://gitlab.test/job" })) };
    }

    return undefined;
  });

  return {
    ...service,
    mergeRequests,
    notes,
    tags,
    pipelineVerdicts,
    get pipelinePolls() {
      return counters.polls;
    },
    set pipelinePolls(value: number) {
      counters.polls = value;
    },
  };
}
