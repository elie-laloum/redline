import { defineTask, type Task } from "@elie-laloum/outpost";
import { arbitrages } from "../../agents/render.ts";
import { gitAllowFailure } from "../../adapters/git.ts";
import { inviteesFor } from "../../domain/allowlist.ts";
import { resolveBySquad } from "../../domain/config.ts";
import { RedlineError } from "../../domain/failure.ts";
import { mergeRequestName, slackChannelName } from "../../domain/naming.ts";
import type { Converged } from "../../workflow/converge.ts";
import { Escalation } from "../../workflow/escalation.ts";
import { emit } from "../run.ts";
import type { ClosingContext } from "./context.ts";
import type { Prose } from "./prose.ts";

export interface OpenedMergeRequest {
  readonly repo: string;
  readonly project: string;
  readonly iid: number;
  readonly url: string;
}

export interface SlackPublication {
  readonly channel: { readonly id: string; readonly name: string };
  readonly invited: readonly string[];
  readonly unknown: readonly string[];
}

export interface JiraPublication {
  readonly transition: string | null;
  readonly commented: boolean;
}

export function pushTask(run: ClosingContext, after: readonly Task[]): Task<readonly string[]> {
  return defineTask({
    key: "push-branches",
    after,
    async perform() {
      for (const repo of run.delivered) {
        const pushed = await gitAllowFailure(repo.directory, ["push", "-q", "--force-with-lease", "-u", "origin", repo.branch], 300_000);
        if (!pushed.ok) throw new Escalation("environment", "push-branches", `push de ${repo.branch} (${repo.repo}) refuse : ${pushed.stderr}`);
        emit(run, { type: "publication", task: "push-branches", action: "push", detail: `${repo.repo} : ${repo.branch} pousse`, url: null });
      }
      return run.delivered.map((repo) => repo.branch);
    },
  });
}

export function description(run: ClosingContext, summary: string, others: readonly OpenedMergeRequest[]): string {
  const decisions = arbitrages([...run.framing.functional.arbitrages, ...run.framing.technical.arbitrages]);
  const links = others.length ? ["", "## Les autres MR de ce ticket", ...others.map((other) => `- ${other.repo} — ${other.url}`)] : [];
  const body = summary.trim().replace(/^(#+ [^\n]*\n+)+/, "");
  return ["## Ce que fait ce changement", body, "", "## Arbitrages", decisions, ...links, "", `Refs: ${run.ledger.key}`].join("\n");
}

export function mergeRequestsTask(run: ClosingContext, prose: Task<Converged<Prose>>, push: Task<readonly string[]>): Task<readonly OpenedMergeRequest[]> {
  const { settings } = run.app.configuration;
  const forge = () => run.app.services.forge;
  return defineTask({
    key: "merge-requests",
    after: [prose, push],
    async perform(context) {
      const summaries = new Map(context.value(prose).candidate.mergeRequests.map((entry) => [entry.repo, entry.summary]));
      const summaryOf = (repo: string) => summaries.get(repo) ?? "";
      const opened: OpenedMergeRequest[] = [];
      for (const repo of run.delivered) {
        const type = run.framing.plan.repos.find((entry) => entry.repo === repo.repo)?.type ?? "task";
        const title = mergeRequestName(settings.naming, { type, ticket: run.ledger.key, title: run.ledger.title }, settings.gitlab.mrDraft);
        const body = description(run, summaryOf(repo.repo), []);
        const existing = await forge().findMergeRequest(repo.project, repo.branch);
        const request = existing
          ? await forge().updateMergeRequest(repo.project, existing.iid, { title, description: body })
          : await forge().createMergeRequest({ project: repo.project, sourceBranch: repo.branch, targetBranch: repo.baseBranch, title, description: body });
        opened.push({ repo: repo.repo, project: repo.project, iid: request.iid, url: request.url });
        emit(run, { type: "publication", task: "merge-requests", action: "merge-request", detail: `${repo.repo} : MR ${existing ? "mise a jour" : "ouverte"}`, url: request.url });
      }
      if (opened.length > 1) {
        for (const request of opened) {
          await forge().updateMergeRequest(request.project, request.iid, { description: description(run, summaryOf(request.repo), opened.filter((other) => other !== request)) });
        }
      }
      return opened;
    },
  });
}

export function slackTask(run: ClosingContext, prose: Task<Converged<Prose>>, requests: Task<readonly OpenedMergeRequest[]>): Task<SlackPublication> {
  const { settings } = run.app.configuration;
  return defineTask({
    key: "slack",
    after: [prose, requests],
    async perform(context) {
      const chat = run.app.services.chat;
      const opened = context.value(requests);
      const channel = await chat.createChannel(slackChannelName(settings.naming, { ticket: run.ledger.key, title: run.ledger.title }), settings.slack.channelVisibility === "private");
      const invitees = inviteesFor(settings.slack, run.ledger.key);
      const found = await Promise.all(invitees.emails.map(async (email) => ({ email, id: await chat.lookupByEmail(email) })));
      const members = found.filter((entry): entry is { email: string; id: string } => entry.id !== null);
      try {
        await chat.invite(channel.id, members.map((entry) => entry.id));
      } catch (error) {
        if (!(error instanceof RedlineError && /already_in_channel/.test(error.message))) throw error;
      }
      const links = opened.map((request) => `- ${request.repo} : ${request.url}`).join("\n");
      const history = await chat.history(channel.id);
      if (!history.some((text) => opened.every((request) => text.includes(request.url)))) {
        await chat.postMessage(channel.id, `${context.value(prose).candidate.slack.trim()}\n\n${links}`);
        emit(run, { type: "publication", task: "slack", action: "slack", detail: `message poste dans #${channel.name}`, url: null });
      }
      const bookmarked = new Set(await chat.bookmarks(channel.id));
      const wanted = [{ title: `${run.ledger.key} (Jira)`, link: run.framing.ticket.url }, ...opened.map((request) => ({ title: `MR ${request.repo}`, link: request.url }))];
      for (const bookmark of wanted.filter((entry) => !bookmarked.has(entry.link))) await chat.addBookmark(channel.id, bookmark.title, bookmark.link);
      return { channel, invited: members.map((entry) => entry.email), unknown: found.filter((entry) => entry.id === null).map((entry) => entry.email) };
    },
  });
}

export function jiraTask(run: ClosingContext, prose: Task<Converged<Prose>>, after: readonly Task[]): Task<JiraPublication> {
  const { settings } = run.app.configuration;
  return defineTask({
    key: "jira",
    after: [prose, ...after],
    async perform(context) {
      const tracker = run.app.services.tracker;
      const target = resolveBySquad(settings.jira.transitions, run.framing.ticket.squad).afterMergeRequest;
      const current = (await tracker.getTicket(run.ledger.key)).status;
      const transition = current.trim().toLowerCase() === target.trim().toLowerCase() ? null : (await tracker.transition(run.ledger.key, target)).name;
      const text = context.value(prose).candidate.jira.trim();
      const already = (await tracker.comments(run.ledger.key)).some((comment) => comment.trim().startsWith(text.slice(0, 120)));
      if (transition) emit(run, { type: "publication", task: "jira", action: "jira", detail: `${run.ledger.key} passe en ${transition}`, url: run.framing.ticket.url });
      if (!already) {
        await tracker.comment(run.ledger.key, text);
        emit(run, { type: "publication", task: "jira", action: "jira", detail: `commentaire poste sur ${run.ledger.key}`, url: run.framing.ticket.url });
      }
      return { transition, commented: !already };
    },
  });
}
