import type { Forge, MergeRequest, PipelineWatch } from "../ports/forge.ts";
import { request } from "./http.ts";

export interface GitlabCredentials {
  readonly host: string;
  readonly token: string;
}

type MergeRequestPayload = {
  readonly iid: number;
  readonly title: string;
  readonly web_url: string;
  readonly source_branch: string;
  readonly target_branch: string;
  readonly description: string | null;
};

type Job = { readonly name: string; readonly status: string };

const SETTLED = new Set(["success", "manual", "skipped"]);

export function createGitlab(credentials: GitlabCredentials): Forge {
  const base = `${credentials.host.replace(/\/+$/, "")}/api/v4`;
  const headers = { "private-token": credentials.token };
  const project = (path: string) => `${base}/projects/${encodeURIComponent(path)}`;

  const latestPipeline = async (path: string, ref: string) => {
    const { data } = await request<{ id: number; web_url: string }[]>(
      `${project(path)}/pipelines?ref=${encodeURIComponent(ref)}&per_page=1&order_by=id&sort=desc`,
      { headers },
    );
    return Array.isArray(data) ? (data[0] ?? null) : null;
  };

  return {
    async findMergeRequest(path, sourceBranch) {
      const { data } = await request<MergeRequestPayload[]>(
        `${project(path)}/merge_requests?state=opened&source_branch=${encodeURIComponent(sourceBranch)}`,
        { headers },
      );
      const found = Array.isArray(data) ? data[0] : undefined;
      return found ? toMergeRequest(found) : null;
    },

    async createMergeRequest(input) {
      const { data } = await request<MergeRequestPayload>(`${project(input.project)}/merge_requests`, {
        method: "POST",
        headers,
        body: {
          source_branch: input.sourceBranch,
          target_branch: input.targetBranch,
          title: input.title,
          description: input.description,
          remove_source_branch: true,
          squash: false,
        },
      });
      return toMergeRequest(data);
    },

    async updateMergeRequest(path, iid, patch) {
      const { data } = await request<MergeRequestPayload>(`${project(path)}/merge_requests/${iid}`, { method: "PUT", headers, body: patch });
      return toMergeRequest(data);
    },

    async watchPipeline(input): Promise<PipelineWatch> {
      const started = Date.now();
      const deadline = started + input.timeoutSeconds * 1000;
      const waited = () => Math.round((Date.now() - started) / 1000);
      while (Date.now() < deadline) {
        input.signal?.throwIfAborted();
        const pipeline = await latestPipeline(input.project, input.ref);
        if (pipeline) {
          const { data } = await request<Job[]>(`${project(input.project)}/pipelines/${pipeline.id}/jobs?per_page=100`, { headers });
          const jobs = (Array.isArray(data) ? data : []).filter((job) => input.jobs.length === 0 || input.jobs.includes(job.name));
          const summary = jobs.map((job) => ({ name: job.name, status: job.status }));
          if (jobs.some((job) => job.status === "failed")) return { verdict: "failed", url: pipeline.web_url, jobs: summary, waitedSeconds: waited() };
          if (jobs.length > 0 && jobs.every((job) => SETTLED.has(job.status))) {
            return { verdict: "success", url: pipeline.web_url, jobs: summary, waitedSeconds: waited() };
          }
        }
        await new Promise((resolve) => setTimeout(resolve, (input.pollSeconds ?? 15) * 1000));
      }
      const pipeline = await latestPipeline(input.project, input.ref);
      return { verdict: pipeline ? "timeout" : "no-pipeline", url: pipeline?.web_url ?? null, jobs: [], waitedSeconds: waited() };
    },
  };
}

function toMergeRequest(payload: MergeRequestPayload): MergeRequest {
  return {
    iid: payload.iid,
    title: payload.title,
    url: payload.web_url,
    sourceBranch: payload.source_branch,
    targetBranch: payload.target_branch,
    description: payload.description ?? "",
  };
}
