import { loadConfig } from "./config.ts";
import { optionalSecret, secret } from "./env.ts";
import { fail } from "./errors.ts";
import { request } from "./http.ts";

export interface MergeRequest {
  readonly iid: number;
  readonly title: string;
  readonly web_url: string;
  readonly source_branch: string;
  readonly target_branch: string;
  readonly draft: boolean;
  readonly description: string;
}

export interface Pipeline {
  readonly id: number;
  readonly status: string;
  readonly web_url: string;
  readonly ref: string;
  readonly sha: string;
}

export interface Job {
  readonly id: number;
  readonly name: string;
  readonly status: string;
  readonly web_url: string;
}

function base(): string {
  const host = optionalSecret("GITLAB_HOST") ?? "https://gitlab.com";
  return `${host.replace(/\/+$/, "")}/api/v4`;
}

function headers(): Record<string, string> {
  return { "private-token": secret("GITLAB_TOKEN") };
}

function project(path: string): string {
  return encodeURIComponent(path);
}

export async function getBranch(projectPath: string, branch: string): Promise<unknown> {
  const { status, data } = await request<unknown>(
    `${base()}/projects/${project(projectPath)}/repository/branches/${encodeURIComponent(branch)}`,
    { headers: headers(), allow: [404] },
  );
  return status === 404 ? null : data;
}

export async function getMergeRequest(projectPath: string, iid: number): Promise<MergeRequest | null> {
  const { status, data } = await request<MergeRequest>(
    `${base()}/projects/${project(projectPath)}/merge_requests/${iid}`,
    { headers: headers(), allow: [404] },
  );
  return status === 404 ? null : data;
}

export async function findMergeRequestForBranch(projectPath: string, branch: string): Promise<MergeRequest | null> {
  const { data } = await request<MergeRequest[]>(
    `${base()}/projects/${project(projectPath)}/merge_requests?state=opened&source_branch=${encodeURIComponent(branch)}`,
    { headers: headers() },
  );
  return Array.isArray(data) ? (data[0] ?? null) : null;
}

export async function createMergeRequest(input: {
  projectPath: string;
  sourceBranch: string;
  targetBranch: string;
  title: string;
  description: string;
}): Promise<MergeRequest> {
  const existing = await findMergeRequestForBranch(input.projectPath, input.sourceBranch);
  if (existing) return updateMergeRequest(input.projectPath, existing.iid, { title: input.title, description: input.description });

  const { data } = await request<MergeRequest>(`${base()}/projects/${project(input.projectPath)}/merge_requests`, {
    method: "POST",
    headers: headers(),
    body: {
      source_branch: input.sourceBranch,
      target_branch: input.targetBranch,
      title: loadConfig().gitlab.mrDraft && !input.title.startsWith("Draft: ") ? `Draft: ${input.title}` : input.title,
      description: input.description,
      remove_source_branch: true,
      squash: false,
    },
  });
  return data;
}

export async function updateMergeRequest(
  projectPath: string,
  iid: number,
  patch: Readonly<Record<string, unknown>>,
): Promise<MergeRequest> {
  const { data } = await request<MergeRequest>(`${base()}/projects/${project(projectPath)}/merge_requests/${iid}`, {
    method: "PUT",
    headers: headers(),
    body: patch,
  });
  return data;
}

export async function listNotes(projectPath: string, iid: number): Promise<unknown[]> {
  const { data } = await request<unknown[]>(
    `${base()}/projects/${project(projectPath)}/merge_requests/${iid}/notes?per_page=100`,
    { headers: headers() },
  );
  return Array.isArray(data) ? data : [];
}

export async function createNote(projectPath: string, iid: number, body: string): Promise<unknown> {
  const { data } = await request<unknown>(
    `${base()}/projects/${project(projectPath)}/merge_requests/${iid}/notes`,
    { method: "POST", headers: headers(), body: { body } },
  );
  return data;
}

export async function createTag(projectPath: string, tag: string, ref: string, message: string): Promise<unknown> {
  const { data } = await request<unknown>(`${base()}/projects/${project(projectPath)}/repository/tags`, {
    method: "POST",
    headers: headers(),
    body: { tag_name: tag, ref, message },
  });
  return data;
}

export async function listTags(projectPath: string): Promise<string[]> {
  const { data } = await request<{ name: string }[]>(
    `${base()}/projects/${project(projectPath)}/repository/tags?per_page=100`,
    { headers: headers() },
  );
  return Array.isArray(data) ? data.map((tag) => tag.name) : [];
}

export async function latestPipeline(projectPath: string, ref: string): Promise<Pipeline | null> {
  const { data } = await request<Pipeline[]>(
    `${base()}/projects/${project(projectPath)}/pipelines?ref=${encodeURIComponent(ref)}&per_page=1&order_by=id&sort=desc`,
    { headers: headers() },
  );
  return Array.isArray(data) ? (data[0] ?? null) : null;
}

export async function pipelineJobs(projectPath: string, pipelineId: number): Promise<Job[]> {
  const { data } = await request<Job[]>(
    `${base()}/projects/${project(projectPath)}/pipelines/${pipelineId}/jobs?per_page=100`,
    { headers: headers() },
  );
  return Array.isArray(data) ? data : [];
}

export type WatchVerdict = "success" | "failed" | "timeout" | "no-pipeline";

export interface WatchResult {
  readonly verdict: WatchVerdict;
  readonly pipeline: Pipeline | null;
  readonly jobs: { name: string; status: string }[];
  readonly waitedSeconds: number;
}

/**
 * Suit les jobs declares dans `ciJobsToWatch`, et eux seuls.
 *
 * Un pipeline « en echec » a cause d'un job de deploiement facultatif ne doit
 * pas bloquer un bump amont ; inversement, un pipeline « vert » dont le job de
 * publication n'a pas tourne ne prouve rien. Le verdict porte donc sur les jobs
 * nommes dans le registre, pas sur le statut global.
 */
export async function watchPipeline(input: {
  projectPath: string;
  ref: string;
  jobs: readonly string[];
  timeoutSeconds: number;
  pollSeconds?: number;
}): Promise<WatchResult> {
  const started = Date.now();
  const poll = (input.pollSeconds ?? 15) * 1000;
  const deadline = started + input.timeoutSeconds * 1000;

  while (Date.now() < deadline) {
    const pipeline = await latestPipeline(input.projectPath, input.ref);
    if (pipeline) {
      const jobs = await pipelineJobs(input.projectPath, pipeline.id);
      const watched = input.jobs.length
        ? jobs.filter((job) => input.jobs.includes(job.name))
        : jobs;
      const summary = watched.map((job) => ({ name: job.name, status: job.status }));

      if (watched.some((job) => job.status === "failed")) {
        return { verdict: "failed", pipeline, jobs: summary, waitedSeconds: elapsed(started) };
      }
      const settled = watched.length > 0 && watched.every((job) => ["success", "manual", "skipped"].includes(job.status));
      if (settled) {
        return { verdict: "success", pipeline, jobs: summary, waitedSeconds: elapsed(started) };
      }
    }
    await new Promise((resolve) => setTimeout(resolve, poll));
  }

  const pipeline = await latestPipeline(input.projectPath, input.ref);
  if (!pipeline) return { verdict: "no-pipeline", pipeline: null, jobs: [], waitedSeconds: elapsed(started) };
  return { verdict: "timeout", pipeline, jobs: [], waitedSeconds: elapsed(started) };
}

export function assertProjectPath(path: string): string {
  if (!path || !path.includes("/")) fail(`Chemin de projet GitLab invalide : ${path}.`);
  return path;
}

function elapsed(started: number): number {
  return Math.round((Date.now() - started) / 1000);
}
