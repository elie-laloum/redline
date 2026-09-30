<p align="center"><img src="assets/cover-v5.png" alt="Redline — One ticket. A coordinated change across repositories." width="100%"></p>

[![npm](https://img.shields.io/npm/v/%40elie-laloum%2Fredline?style=flat-square&color=586475)](https://www.npmjs.com/package/@elie-laloum/redline)
[![Built on outpost](https://img.shields.io/badge/built%20on-%40elie--laloum%2Foutpost-586475?style=flat-square)](https://www.npmjs.com/package/@elie-laloum/outpost)
[![License](https://img.shields.io/badge/license-MIT-586475?style=flat-square)](LICENSE)

# redline

Redline takes a Jira ticket and carries it to draft merge requests across every repository it
touches. It frames the work with one human review, delivers each repository test-first with
adversarial reviewers, in dependency order, updates a versioned knowledge base, then publishes
everything in a single block: branches, merge requests, a Slack channel and a Jira transition.

```
bun redline start <jira-url-or-key> [--notes "…"] [--figma <url>…]
```

Redline is built on [**`@elie-laloum/outpost`**](https://www.npmjs.com/package/@elie-laloum/outpost)
([documentation](https://elie-laloum.github.io/outpost/)), a TypeScript library for running
coding agents in sandboxes and composing their work into typed, checkpointed workflows. Outpost
runs the agents; redline decides what they are asked, checks what they return, and does
everything else itself.

> **Read this first.** This is one developer's working system, opened up because the design
> may be useful to others — not a product. It assumes Jira Cloud, GitLab and Slack, and it was
> shaped against a specific codebase. Nothing here auto-detects your setup: repositories,
> commands and CI jobs are declared by hand in a registry file. Expect to adapt it, not to
> install it. The CLI, the dashboard and the agent briefs speak French.

**Original repository: [GitLab](https://gitlab.elielaloum.com/elielaloum/redline)** ·
[Public GitHub mirror](https://github.com/elie-laloum/redline). The GitLab origin is private
and requires access. Changes are integrated in GitLab and synchronized to GitHub.

## Contents

- [How it works](#how-it-works)
- [What outpost provides](#what-outpost-provides)
- [Durable by construction](#durable-by-construction)
- [Watching a run](#watching-a-run)
- [Requirements](#requirements)
- [Install](#install)
- [Commands](#commands)
- [Where things live](#where-things-live)
- [Development](#development)
- [Out of scope, deliberately](#out-of-scope-deliberately)
- [Documentation](#documentation)

## How it works

**Code decides, agents judge.** Everything that happens the same way on every run is plain
TypeScript: fetching the ticket, choosing candidate repositories, running tests, committing,
counting loop budgets and disputes, tagging, bumping, pushing, opening merge requests, posting
to Slack. An agent is called only where judgment is needed — asking the right question,
reading code for impact, planning, writing tests and code, criticising them, classifying a
failure, writing prose — and it answers in JSON validated against a schema.

A run has three phases. Each one is an outpost workflow.

```
■ code   ◆ agent   ⟲ bounded loop

FRAMING    ■ ticket → ■ figma → ■ memory → ◆ functional grill ⟲ human
           → ■ candidate repos → ◆ scope scout × N (parallel) → ■ evidence checked on disk
           → ■ memory → ◆ technical grill ⟲ human → ◆ planner ⟲ ■ plan rules → ■ human review

DELIVERY   per repository, by ascending level
           ■ workspace (branch, bump, install, containers)
           ⟲ ◆ test writer   | ■ write zone · ◆ test adversary · ■ run → ■ already green? → ◆ red checker
           ◆ developer, in batches
           ⟲ ◆ developer     | ■ appeals → ◆ arbiter · ■ green (typecheck, lint, suites) · ◆ code adversary
           ■ upstream release: dev tag → push the tag only → watch CI → ■ bump downstream

CLOSING    ◆ memory planner ⟲ ■ ops check → ■ one memory commit
           → ◆ finalizer ⟲ ■ publishable → ■ push · draft MRs · Slack · Jira
```

**Framing** reads the ticket together with the tickets it points to — parent, subtasks, formal
links and `/browse/` links to the same Jira site — and hands them to every agent as context; the
scope stays the ticket's own. The `--notes` given to `start` reach every agent too. The functional
grill asks the human what the ticket leaves open. Scope scouts then read each candidate
repository in parallel and must cite `file:line` evidence, which redline checks on disk. The
technical grill settles the remaining choices, and the planner writes a plan per repository with
two checklists — tests and code — that the plan rules validate before a human sees it.

**Delivery** takes the repositories by ascending `level`. In each one, the test writer writes
failing tests, which must stay inside test files, survive a test adversary, fail when run — a
test that is already green proves nothing — and fail for the right reason, as judged by the red
checker. The developer then implements the code checklist in batches. It never edits a test: it
files an appeal, which an arbiter settles, and a test contested too often escalates. The code
must pass the registry's typecheck, lint and test commands, then a code adversary. A repository
that others in scope depend on is released as a dev tag, its CI is watched, and the downstream
repositories adopt that version before their own turn.

**Closing** plans the memory update, checks every operation, and applies it as one commit to the
knowledge base. The finalizer writes the merge request summaries, the Slack message and the Jira
comment in your voice. Redline then pushes the branches, opens or updates the draft merge
requests with links to one another, creates the Slack channel and invites the allowlist,
comments on the ticket and moves it.

**Twelve roles**, one brief each in [src/prompts/](src/prompts/): functional grill, scope scout,
technical grill, planner, test writer, test adversary, red checker, developer, appeal arbiter,
code adversary, memory planner and finalizer. The model and reasoning effort of each role are
set in `redline.yaml`.

Agents never commit. Redline folds their changes into a commit whose message it builds itself,
and reverts anything written outside the role's zone — tests for the test writer, code for the
developer.

## What outpost provides

Redline uses [`@elie-laloum/outpost`](https://www.npmjs.com/package/@elie-laloum/outpost) for
everything that runs an agent or keeps a workflow alive, and adds none of it itself:

| Outpost | Used by redline for |
|---|---|
| `defineWorkflow`, `defineTask` | the three phases and their tasks, with explicit dependencies |
| `defineLoopTask` | every bounded loop: one attempt, then checks that return feedback or pass |
| tasks with an `interaction` | grill questions and the plan review — the run stops, the human answers, the run resumes |
| workflow checkpoints and the task cache | resuming a run where it stopped, and restoring finished tasks after a reopen |
| `openWorkspace`, `createSandbox`, the Docker provider | one git worktree per repository, agents in containers, registry repositories mounted read-only |
| `createClaudeHarness`, `defineAgentTask`, `defineJsonResponse` | Claude Code inside the container, answering in validated JSON |
| quota pauses | a run that hits a usage limit pauses instead of failing |
| the `outpost` CLI | `redline image build` and `redline image doctor` |

## Durable by construction

Each phase has a checkpoint under `~/.redline/runs/<KEY>/`, and a ledger in
`~/.redline/tickets/<KEY>.yaml` records the phase, the approved plan, what was delivered, what
was published and the tokens spent. `Ctrl-C` stops a run cleanly, and
`bun redline resume <KEY>` picks up at the task that was interrupted: finished tasks, finished
interviews and finished code batches are never redone.

The plan review is the only gate. `Amend` reruns the planner alone with your note; `Reject`
reopens the functional or the technical grill with it, and everything upstream of what was
reopened is restored from cache. After approval, everything runs to publication, including the
public, irreversible actions. What can still stop a run is an escalation:

| Escalation | Raised when |
|---|---|
| `convergence` | a loop's gate exceeded its budget |
| `environment` | something outside the agents is broken — a fetch, an install, a stalled command, a CI pipeline — and no turn is spent on it |
| `arbitrage` | the decision belongs to a human: a line the registry cannot test, a test contested too often, no repository in scope |

```
bun redline resume <KEY>                        # after fixing the environment
bun redline resume <KEY> --fresh --note "…"     # reopen the escalated task with a new budget
```

## Watching a run

In a terminal, `start` and `resume` open a full-screen dashboard: every task seen, phase by phase,
with its status; the ticket's tokens; the loop's spent budget per gate; the repositories
delivered; the selected task's result and its agents live; and a journal of verdicts, commands
and public actions. Grill questions and the plan review are answered in its panels, and a pending
one rings the bell. When the run ends the screen stays on the outcome until `q`, then the plain
report is printed. `--plain`, a pipe or CI keep the plain-text output.

Design decisions, keys and the event channel behind it: [docs/tui.md](docs/tui.md).

## Requirements

- **Bun 1.3.14+** — runtime, package manager and test runner. TypeScript runs as is.
- **Docker** — agents run in containers built from `docker/agent.Dockerfile`, with Claude Code
  pinned. Tests and builds run on your machine, in the worktree the agent edits. Colima works
  as is.
- **Claude credentials** — by default the account logged in on the machine
  (`~/.claude/.credentials.json`); a `claude setup-token` token or an API key also work.
- **Jira Cloud, GitLab and Slack** — a personal token for each. The Slack token is a **user**
  token (`xoxp-`): every action appears under your own name.
- **Figma** is optional. Without a token the run continues without mockups.

## Install

From a clone:

```
bun install
mkdir -p ~/.redline
cp templates/env.example ~/.redline/.env                             # then fill in the tokens
cp templates/redline.example.yaml ~/.redline/redline.yaml
cp templates/repositories.example.yaml ~/.redline/repositories.yaml  # your repositories
cp templates/voice.template.md ~/.redline/voice.md                   # your writing voice
bun redline image build                                              # the agent image, built locally
bun redline check
```

Redline is also published on npm as
[`@elie-laloum/redline`](https://www.npmjs.com/package/@elie-laloum/redline). It still runs on
Bun: `bun add -g @elie-laloum/redline`, then `redline check`. The templates and the Dockerfile
ship with the package.

`bun redline check` is the command to run after any change. The full walkthrough — tokens and
their scopes, authentication modes, the registry, the settings and your writing voice — is in
[docs/setup.md](docs/setup.md).

## Commands

| Command | What it does |
|---|---|
| `start <ticket> [--notes …] [--figma <url>…] [--auth <mode>] [--plain]` | frames, delivers and publishes a ticket; on a ticket that already has a run, resumes it |
| `resume <ticket> [--fresh] [--note …] [--auth <mode>] [--plain]` | resumes an interrupted, waiting or escalated run; `--fresh` reopens the escalated task with a new budget |
| `status [ticket] [--plan]` | lists the runs, or shows one run's phase, escalation, history and approved plan |
| `clear <ticket> [--force] [--dry-run]` | removes a ticket's local state: worktrees, local branches, run, ledger, logs; lists the remote traces it leaves |
| `auth [account\|oauth\|key]` | shows or changes how agents authenticate to Claude |
| `check` | validates settings and registry, tokens, the Jira login, Docker, the agent image, Claude credentials and the registry checkouts |
| `bench [repo…] [--kinds ut,lint]` | times the registry commands and measures their longest silence |
| `image build` · `image doctor` | builds the agent image declared in `sandbox.image`; checks that Claude answers inside it |
| `migrate-home [--from ~/.autopilot]` | copies the memory of a former autopilot installation |

From a clone, prefix each command with `bun redline`; from npm, with `redline`.

## Where things live

**The project holds the code and the templates.**

```
redline/
├── src/
│   ├── cli/          commander + clack commands; dashboard/ (pure view model), tui/ (OpenTUI)
│   ├── app/          composition root, phase driver, ledger, lock, settings, home, diagnostics
│   ├── phases/       framing/, delivery/, closing/ — one outpost workflow each
│   ├── workflow/     converge (loops with per-gate budgets), durable interview, memo, pool
│   ├── agents/       one file per role: typed input, response schema
│   ├── prompts/      one brief per role, in French
│   ├── domain/       pure rules: config schemas, plan, scope, memory, naming, versions, zones
│   ├── ports/        what phases need from the outside
│   └── adapters/     Jira, GitLab, Slack, Figma, git, exec, checks, Claude, outpost sandboxes
├── templates/        redline.example.yaml, repositories.example.yaml, env.example, voice.template.md
├── docker/           agent.Dockerfile
├── docs/             setup, architecture, terminal interface
└── tests/            unit/, workflow/, kit/, fixtures/
```

**`~/.redline` holds your configuration, the knowledge and the state.** Set `REDLINE_HOME` to
move it.

```
~/.redline/
├── redline.yaml            budgets, timeouts, naming, agents, sandbox, allowlist, transitions
├── repositories.yaml       the registry: levels, commands, CI jobs, dependencies
├── .env                    the tokens
├── voice.md                your writing voice
├── memory/                 the knowledge base, versioned
├── tickets/<KEY>.yaml      the ledger of a run, versioned
├── runs/<KEY>/             checkpoints and cache, disposable
├── logs/<KEY>/             full command output, disposable
├── figma/<KEY>/            rendered mockups, disposable
├── locks/                  one lock per running ticket
└── tmp/                    redline's TMPDIR, disposable
```

`~/.redline` is a git repository in which everything is ignored except `memory/` and
`tickets/`. Any configuration file missing from it falls back to its template, which lets a fresh
clone run its test suite before anything is configured. How the code is organised and why:
[docs/architecture.md](docs/architecture.md).

## Development

| Command | What it answers |
|---|---|
| `bun run test` | is this **function** correct? |
| `bun run test:workflow` | does the **chain** hold end to end? scripted agents, real git, fake Jira, GitLab and Slack |
| `bun run typecheck` | do the types hold? |
| `bun run fixtures` | writes the fixture repositories to `tests/.fixtures/` to open them by hand |

The workflow tests replace a dry-run flag, and replace it better: agents are scripted
in-process through outpost's own harness, the fixture repositories are real repositories with a
real bare remote, and Jira, GitLab and Slack are local fake servers. Every scenario asserts what
actually happened — commits, tags, merge requests, messages.

A git repository inside a git repository is a nested `.git`, which git will not track without a
submodule. The fixture repositories are therefore described in `tests/fixtures/repos.ts` and
materialized per test in a temporary directory: different levels, an upstream/downstream
dependency, a monorepo, and a suite that can be made to fail on demand.

## Out of scope, deliberately

**Merge request feedback** — collecting review comments, CI results and Slack threads, then
handling them on the same branch — does not exist yet; it is handled by hand.

**No semantic index.** Memory selection is a deterministic filter on the frontmatter, the
ticket's words and the repositories in scope, within a fixed budget: exact, free, debuggable,
never out of sync.

**No eval runner yet.** The roles are covered by the workflow tests with scripted answers; a
runner that scores real Claude answers against planted defects is still to be built on outpost.

## Documentation

- [docs/setup.md](docs/setup.md) — tokens, authentication, the registry, the settings, your writing voice
- [docs/architecture.md](docs/architecture.md) — layers, phases, loops, escalations, durability
- [docs/tui.md](docs/tui.md) — the terminal dashboard and its event channel
- [CHANGELOG.md](CHANGELOG.md) — what changed, release by release
- [CONTRIBUTING.md](CONTRIBUTING.md) — how to propose a change

## License

MIT — see [LICENSE](LICENSE).
