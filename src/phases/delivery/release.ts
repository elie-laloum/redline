import { defineTask, type Task } from "@elie-laloum/outpost";
import { manifestVersion } from "../../adapters/packages.ts";
import { git, gitAllowFailure, listTags } from "../../adapters/git.ts";
import { parseDevVersion, nextDevVersion } from "../../domain/versions.ts";
import { Escalation } from "../../workflow/escalation.ts";
import { emit } from "../run.ts";
import { type DeliveryContext, type RepoTarget, withTarget } from "./context.ts";
import type { Release } from "./summary.ts";

export function releaseTask(run: DeliveryContext, target: RepoTarget, after: readonly Task[]): Task<Release> {
  const key = `${target.repo.name}.release`;
  const { settings } = run.app.configuration;
  return defineTask({
    key,
    after,
    perform: () =>
      withTarget(run, target, async (opened) => {
        const directory = opened.directory;
        const version = manifestVersion(directory, target.repo.release.manifest);
        if (!version) throw new Escalation("environment", key, `aucune version lisible dans ${target.repo.release.manifest}`);
        const base = `${target.repo.release.tagPrefix}${version}`;
        const tag = (await tagAtHead(directory, base, run.ledger.key)) ?? (await createTag(directory, base, run.ledger.key, settings.naming.devVersionSuffix));
        const pushed = await gitAllowFailure(directory, ["push", "-q", "origin", `refs/tags/${tag}`], 300_000);
        if (!pushed.ok) throw new Escalation("environment", key, `push du tag ${tag} refuse : ${pushed.stderr}`);
        emit(run, { type: "publication", task: key, action: "tag", detail: `tag ${tag} pousse`, url: null });
        const watch = await run.app.services.forge.watchPipeline({
          project: target.repo.gitlabProject,
          ref: tag,
          jobs: target.repo.ciJobsToWatch,
          timeoutSeconds: settings.timeouts.ciPipelineSeconds,
          pollSeconds: settings.timeouts.ciPollSeconds,
          ...(run.signal ? { signal: run.signal } : {}),
        });
        emit(run, { type: "publication", task: key, action: "pipeline", detail: `pipeline du tag ${tag} : ${watch.verdict}`, url: watch.url ?? null });
        if (watch.verdict !== "success") {
          const jobs = watch.jobs.map((job) => `${job.name}=${job.status}`).join(", ");
          throw new Escalation("environment", key, `pipeline du tag ${tag} : ${watch.verdict} apres ${watch.waitedSeconds}s${jobs ? ` (${jobs})` : ""}${watch.url ? ` — ${watch.url}` : ""}`);
        }
        return { tag, version: tag.slice(target.repo.release.tagPrefix.length) };
      }),
  });
}

async function tagAtHead(directory: string, base: string, ticket: string): Promise<string | null> {
  const tags = (await git(directory, ["tag", "--points-at", "HEAD"])).split("\n").filter(Boolean);
  return tags.find((tag) => {
    const parsed = parseDevVersion(tag);
    return parsed?.base === base && parsed.ticket.toUpperCase() === ticket.toUpperCase();
  }) ?? null;
}

async function createTag(directory: string, base: string, ticket: string, suffix: string): Promise<string> {
  await gitAllowFailure(directory, ["fetch", "-q", "origin", "--tags"]);
  const tag = nextDevVersion(base, ticket, await listTags(directory), suffix);
  await git(directory, ["tag", "-a", tag, "-m", `${tag} (${ticket})`]);
  return tag;
}
