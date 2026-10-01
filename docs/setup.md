# Setup

This page takes you from a clone to a first run: the home directory, the tokens, how agents
authenticate, the agent image, the registry of repositories, the settings and your writing
voice. The [README](../README.md) gives the overview.

## 1. Install

You need Bun 1.3.14+, Docker, git, and a Claude account or API key.

```
bun install
bun redline --help
```

Or from npm, still on Bun: `bun add -g @elie-laloum/redline`, then `redline --help`. The
templates and the Dockerfile ship with the package. The rest of this page writes `bun redline`;
installed from npm, the command is `redline`.

## 2. The home directory

Everything personal lives in `~/.redline`, or in the directory named by `REDLINE_HOME`. `start`
creates its layout on first use and makes it a git repository in which only `memory/` and
`tickets/` are tracked. Copy the templates into it:

```
mkdir -p ~/.redline
cp templates/env.example ~/.redline/.env
cp templates/repositories.example.yaml ~/.redline/repositories.yaml
cp templates/voice.template.md ~/.redline/voice.md
```

`redline.yaml` holds only what you change: every key it does not set comes from the package's
defaults, `templates/redline.example.yaml`, so new defaults reach you with each release. Do not
copy the whole template. A file written before 4.0, which was such a copy, is reduced to what
differs from the defaults the first time redline reads it, and the original is kept as
`redline.yaml.3.bak`. `repositories.yaml` has no fallback: without it, `start` refuses to run.
`voice.md` falls back to the uncalibrated template. `.env` has no fallback.

## 3. Tokens

Tokens are read from `~/.redline/.env`. A variable exported in the shell overrides its line
there. The `.env` of the directory you launch redline from is never read, although Bun would load
it by default. No token reaches an agent, except the Claude credential of the `oauth` and `key`
modes, which the agent's container needs to authenticate.

| Variable | Required | What it is |
|---|---|---|
| `JIRA_SITE_URL`, `JIRA_EMAIL`, `JIRA_API_TOKEN` | yes | an Atlassian API token. Jira Cloud authenticates in Basic, with the e-mail and the token. |
| `GITLAB_TOKEN` | yes | a personal access token with the `api` and `write_repository` scopes |
| `GITLAB_HOST` | no | defaults to `https://gitlab.com` |
| `SLACK_USER_TOKEN` | yes | a **user** token (`xoxp-`) with the user scopes `groups:write`, `groups:write.invites`, `bookmarks:write`, `chat:write`, `users:read.email` |
| `FIGMA_TOKEN` | no | a read-only personal token. Without it the run continues without mockups. |
| `CLAUDE_CODE_OAUTH_TOKEN` | `oauth` mode | the token `claude setup-token` prints |
| `ANTHROPIC_API_KEY` | `key` mode | an Anthropic API key, billed by usage |

The Slack token is a user token on purpose: every action appears under your own name. With a
bot token the channel would be created by an app, and the point — a colleague seeing that *you*
opened the channel — falls away.

## 4. How agents authenticate

| Mode | Credential |
|---|---|
| `account` (default) | the Claude account logged in on the machine, `~/.claude/.credentials.json` |
| `oauth` | `CLAUDE_CODE_OAUTH_TOKEN`, from `claude setup-token` |
| `key` | `ANTHROPIC_API_KEY`, billed by usage |

`bun redline auth` shows the active mode and whether its credential is there.
`bun redline auth <mode>` writes the mode into `redline.yaml` — only that value changes, comments
included — and asks for the missing token, which it writes into `.env`. `start` and `resume` take
`--auth <mode>` to override it for one run.

## 5. The agent image

Agents run Claude Code inside a Docker container. `sandbox.image` in `redline.yaml` names the
image, and `bun redline image build` builds it from `docker/agent.Dockerfile` through the outpost
CLI, with your user and group ids so the agent writes files you own. `bun redline image doctor`
checks that Claude answers inside it. `start` and `resume` check that Docker answers and that the
image exists; when it does not, they offer to build it.

`sandbox.cpus` and `sandbox.memoryMb` limit each container. `sandbox.agentChecks: true` lets the
developer run the registry's typecheck and lint inside its container; by default it runs nothing
and redline returns the errors after its turn.

On macOS with Colima, which shares only `$HOME` with its VM, nothing is needed: redline points
`TMPDIR` at `~/.redline/tmp`, so the folders outpost mounts are always shared.

## 6. The registry: `repositories.yaml`

Almost all of the adaptation to your stack happens here, and none of it in code. The registry is
the only source of truth on how to run what: no command is inferred from a detected runner.

**Each repository** declares where it lives and how it relates to the others:

| Key | Meaning |
|---|---|
| `name`, `path`, `gitlabProject`, `baseBranch` | identity, local checkout, GitLab project path (`group/project`), branch to start from |
| `level`, `dependsOn` | processing order. An upstream repository has a strictly lower level than anything depending on it, and the loader refuses a registry where a dependency flows the wrong way. |
| `layer`, `packageManager`, `monorepoTool`, `packageName` | `front`, `backend`, `data` or `eval`; `npm`, `pnpm`, `yarn` or `bun`; `turbo`, `lerna` or `null`; the published package name, or `null` |
| `description`, `keywords` | read by the scope scouts. A repository whose name or keywords appear in the ticket or the functional answers is a candidate, with its direct dependency neighbours; when none match, every repository is. |
| `ciJobsToWatch` | the jobs whose result decides whether an upstream release passed |

**Each command** — `lint`, `typecheck`, `ut`, `it`, `ft`, `ct`, `e2e` — is a shell command or
`null`. `null` means "this kind of check does not exist here", and it is a prohibition, not a
gap: a plan that asks for an undeclared kind is refused before a human ever sees it. A
repository with no test command at all must say so with `withoutTests: true`. Never put a
plausible but unverified command in the registry — a test you believe you are running and that
never runs is worse than no test at all.

A few keys exist because their absence cost real hours:

| Key | Why |
|---|---|
| `localFiles` | ignored files, such as `.env`, to copy into a fresh worktree. A service that does not boot without them turns tests red for a reason unrelated to the code. |
| `containers` | what must be up before the first test: `required` and the `images` to pull. Without a daemon, some suites stay silent until the timeout. |
| `reports` | where a command writes its diagnostics when it does not write them to stdout. Without it, a lint that writes a report file fails with a silent `exit 1`. |
| `targeting` | how a runner accepts being pointed at specific files, with `{paths}` or `{glob}`. Absent, the paths are appended; `null` says this kind cannot be targeted. |
| `release` | for a publishable repository: the `manifest` that holds its version (`package.json` by default) and its `tagPrefix` (`v` by default) |
| `bump` | how a downstream repository adopts an upstream dev version, with `{package}` and `{version}` |

`evalOnly` reserves test-bench repositories for the Jira projects it lists: a real ticket cannot
land on them, and a ticket from those projects touches no production repository.

## 7. The settings: `redline.yaml`

| Section | What it sets |
|---|---|
| `budgets` | loop turns before escalation, per gate: `testAdversary`, `redChecker`, `testDispute`, `greenChecker`, `codeAdversary`; `disputeBeforeEscalation` (the same test contested this many times escalates); `developerBatchLines`; `grillRounds`; `planRepairs`, `memoryRepairs`, `proseRepairs` |
| `timeouts` | CI pipeline and polling, repository setup, registry commands and their tolerated silence, container start, image pull, agent turn and agent idle time |
| `memory` | the maximum length of a note, and how many notes and lines are selected for a brief |
| `naming` | branch, merge request and Slack channel patterns with `{type}`, `{ticket}`, `{slug}`, `{titre}`, `{n}`; the allowed types; the mapping from Jira issue types |
| `git.committer` | the identity of the commits redline makes, when it must differ from your git config |
| `gitlab.mrDraft` | open merge requests as drafts |
| `jira.transitions` | the status to move the ticket to once the merge requests are open, by default and per Jira project |
| `slack` | channel visibility, and the strict allowlist of invitees, by default and per Jira project |
| `agents` | the authentication mode, and the model and reasoning effort by default and per role |
| `sandbox` | the agent image, container limits, `agentChecks` |
| `scope.concurrency` | how many scope scouts run in parallel |

`commandSilenceSeconds` deserves a measurement rather than a guess: beyond it, a silent command
is treated as waiting on infrastructure and escalates as `environment`.
`bun redline bench [repo…] [--kinds ut,lint]` runs the registry commands in each checkout and
reports their duration and their longest silence.

## 8. Your writing voice

The closing phase publishes under **your own name** — a Slack message, a Jira comment, merge
request descriptions. A message that reads as machine-written is worse than no message at all,
so the finalizer writes with `~/.redline/voice.md`: a profile of how *you* write, derived from
what you have actually written. While it does not exist, the template is used and the finalizer
is told the voice is not calibrated, so it stays factual instead of imitating a style it does not
know.

To produce yours, gather a real corpus — your own merge request comments, Slack messages and
commit messages; a few hundred lines is plenty — and give Claude this prompt alongside it:

> You are building a writing-voice profile that another AI agent will follow to write
> messages published under my name — Slack, Jira comments, GitLab MR thread replies.
>
> The corpus below contains only texts I wrote myself. Work from observation, never from
> assumption: every rule you state must be backed by a pattern that actually recurs in the
> corpus, and you must quote real examples for each one. Where the corpus is too thin to
> conclude, say so explicitly rather than filling the gap — mark those sections as
> extrapolated.
>
> Follow the structure of `voice.template.md` exactly, section by section. Pay particular
> attention to:
>
> - the **invariants** — what holds in every context, especially punctuation and spacing
>   habits, which are the most visible signature and the first thing an agent gets wrong;
> - **restrictive** rules over permissive ones. An agent's reflex is to structure text with
>   labels, headings and bullet lists, and that is what gives away automation fastest. State
>   plainly what I never do.
> - the **lexicon** — the words I use and the words I never use. Two people following the
>   same rules are told apart by this.
> - a final **self-check list** of eight to ten closed questions derived from the rules above,
>   where a single "no" means rewrite.
>
> Keep the `@redline` / `@autopilot` prohibition from the template verbatim: it is a system
> constraint, not a style preference.
>
> Report the corpus volume you actually analysed, per source, in the table at the top.
>
> Here is the corpus:
> [paste]

Then read it back and correct it by hand. A profile you have not reread is a profile that will
publish something you would not have written.

## 9. Check

```
bun redline check
```

Run it after any change. It says whether the settings and the registry are yours or the
templates, reports missing tokens, logs in to Jira, checks Docker, the agent image and your
Claude credentials, and warns about registry checkouts that are missing, dirty or off their base
branch — the scouts read them as they are. It exits non-zero while anything blocks a run.

## 10. Coming from autopilot

`bun redline migrate-home [--from ~/.autopilot]` copies the memory notes of a former autopilot
installation and archives its ticket files under `tickets/autopilot/`, without resuming them. It
lists the old worktrees to remove by hand.
