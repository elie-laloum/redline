<p align="center"><img src="assets/cover-v5.png" alt="Redline — One ticket. A coordinated change across repositories." width="100%"></p>

[![License](https://img.shields.io/badge/license-MIT-586475?style=flat-square)](LICENSE)

# redline

Autonomous delivery from a Jira ticket, built on
[outpost](https://elie-laloum.github.io/outpost/). It takes a ticket and carries it to draft
merge requests: framing with one human review, adversarial TDD repository by repository in
dependency order, a memory update, then publication in a single block.

```
bun redline start <jira-url-or-key> [--notes "…"] [--figma <url>…]
```

> **Read this first.** This is one developer's working system, opened up because the design
> may be useful to others — not a product. It assumes Jira, GitLab and Slack, and it was
> shaped against a specific codebase. Nothing here auto-detects your setup: repositories,
> commands and CI jobs are declared by hand in a registry file. Expect to adapt it, not to
> install it. The agent briefs are in French.

**Original repository: [GitLab](https://gitlab.elielaloum.com/elielaloum/redline)** ·
[Public GitHub mirror](https://github.com/elie-laloum/redline). The GitLab origin is private
and requires access. Code changes are integrated in GitLab and synchronized to GitHub.

## The idea that carries the rest

**Code decides, agents judge.** Everything that happens the same way on every run is plain
TypeScript: fetching the ticket, choosing candidate repositories, running tests, committing,
counting loop budgets and disputes, tagging, bumping, pushing, opening merge requests, posting
to Slack. An agent is called only where a judgment is needed — asking the right question,
reading code for impact, planning, writing tests and code, criticising them, classifying a
failure, writing prose — and it answers in JSON validated against a schema.

```
■ code   ◆ agent   ⟲ bounded loop

FRAMING    ■ ticket → ■ figma → ■ memory → ◆ functional grill ⟲ human
           → ■ candidate repos → ◆ scope scout × N (parallel) → ■ evidence checked on disk
           → ◆ technical grill ⟲ human → ◆ planner ⟲ ■ plan rules → ■ human review

DELIVERY   per repository, by ascending level
           ■ workspace (branch, bump, install, containers)
           ⟲ ◆ test writer   | ■ write zone · ◆ test adversary · ■ run → ■ already green? → ◆ red checker
           ◆ developer, in batches
           ⟲ ◆ developer     | ■ appeals → ◆ arbiter · ■ green (typecheck, lint, suites) · ◆ code adversary
           ■ upstream release: dev tag → push the tag only → watch CI → ■ bump downstream

CLOSING    ◆ memory planner ⟲ ■ ops check → ■ one memory commit
           → ◆ finalizer ⟲ ■ publishable → ■ push · draft MRs · Slack · Jira
```

The ticket comes with the tickets it points to — parent, subtasks, formal links and `/browse/`
links to the same Jira site in its description — read once and handed to every agent that reads
the ticket, as context: the scope stays the ticket's own. The `--notes` given to `start` reach
every agent too.

Every loop is one outpost loop task with one budget per gate: when a gate exceeds its budget
the run escalates as `convergence`, a broken environment escalates at once as `environment`
without spending a turn, and a decision that belongs to a human escalates as `arbitrage`.
Agents never commit: redline folds their changes into a commit whose message it builds itself,
and reverts anything written outside the role's zone — tests for the test writer, code for the
developer.

## Durable by construction

Each phase is an outpost workflow with a checkpoint under `~/.redline/runs/<KEY>/`. Questions
to the human are interaction tasks: the run stops, the CLI asks, the run resumes with the
answer. `Ctrl-C` stops a run cleanly, and `bun redline resume <KEY>` picks up at the task that
was interrupted — finished tasks, finished interviews and finished code batches are never
redone.

The human review of the plan is the only gate. `Amend` reruns the planner alone with your note;
`Reject` reopens the functional or technical grill with it, and everything upstream of what was
reopened is restored from cache. After approval, everything runs to publication, including
the public, irreversible actions. The only interruptions left are escalations:

```
bun redline resume <KEY>                        # after fixing the environment
bun redline resume <KEY> --fresh --note "…"     # reopen the escalated task with a new budget
```

## Where things live

**The project holds the code and the templates.**

```
redline/
├── src/
│   ├── cli/          commander + clack: start, resume, status, clear, check, bench, image, migrate-home
│   ├── app/          composition root, phase driver, ledger, lock, settings, home
│   ├── phases/       framing/, delivery/, closing/ — one outpost workflow each
│   ├── workflow/     converge (loops with per-gate budgets), durable interview, memo
│   ├── agents/       one file per role: typed input, response schema
│   ├── prompts/      one French brief per role
│   ├── domain/       pure rules: config schemas, plan, scope, memory, naming, versions, zones
│   ├── ports/        what phases need from the outside
│   └── adapters/     Jira, GitLab, Slack, Figma, git, exec, checks, Claude, sandboxes
├── templates/        redline.example.yaml, repositories.example.yaml, env.example, voice.template.md
├── evals/            planted-defect cases per role
└── tests/            unit/, workflow/, kit/, fixtures/
```

**`~/.redline` holds your configuration, the knowledge and the state.**

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
└── tmp/                    redline's TMPDIR, disposable
```

Tokens come from `~/.redline/.env`; a variable exported in the shell overrides its line there.
The `.env` of the directory you launch redline from is never read, although Bun would load it
by default.

It is a git repository, but everything in it is ignored except `memory/` and `tickets/`. Any
file missing from it falls back to its template, which is what lets a fresh clone run its test
suite before anything is configured. Scouts, grills and the planner read in a sandbox over this
repository, with every registry repository mounted read-only under `/repos/<name>`.

## Requirements

- **Bun 1.3.14+** — package manager, runtime and test runner. TypeScript runs as is.
- **Docker** — agents run in containers built from the outpost agent image; tests and builds
  run on your machine, in the worktree the agent edits. Colima works as is: it shares only
  `$HOME` with its VM, so redline points `TMPDIR` at `~/.redline/tmp` rather than `/var/folders`.
- **Claude Code credentials** — agents use your account (`~/.claude/.credentials.json`, or
  `claude setup-token`).
- **Jira Cloud**, **GitLab**, **Slack** — with a personal access token for each.
- **Figma** is optional. Without a token the run continues without mockups.

The Slack token is a **user** token (`xoxp-`), not a bot token: every action appears under your
own name. With a bot token the channel would be created by an app, and the point — a colleague
seeing that *you* opened the channel — falls away.

## Install

```
bun install
mkdir -p ~/.redline
cp templates/env.example ~/.redline/.env                             # then fill in the tokens
cp templates/redline.example.yaml ~/.redline/redline.yaml
cp templates/repositories.example.yaml ~/.redline/repositories.yaml  # your repositories
cp templates/voice.template.md ~/.redline/voice.md                   # your voice — see below
bun redline image build                                              # the agent image, built locally
bun redline check
```

`start` and `resume` first check that Docker answers and that the agent image exists; when it
does not, they offer to build it.

The CLI is also published on npm as `@elie-laloum/redline`. It still runs on Bun:
`bun add -g @elie-laloum/redline`, then `redline check`. The templates ship with the package.

`bun redline check` is the one command to run after any change: it validates the settings and
the registry, reports missing tokens, logs in to Jira, checks Docker, the agent image and your Claude
credentials, and warns about registry checkouts that are dirty or off their base branch —
scouts read them as they are.

`bun redline bench [repo…] [--kinds ut,lint]` runs the registry commands in each checkout and
reports their duration and their longest silence — the number that calibrates
`commandSilenceSeconds`, beyond which a silent command is treated as an infrastructure wait.

Coming from the former plugin, `bun redline migrate-home` copies `~/.autopilot/memory` over and
archives its ticket files.

## Adapting it to your own stack

Almost all of the adaptation happens in `repositories.yaml`, and none of it in code.

**Declare each repository** with its `level`, its local path, its GitLab project, its base
branch and its dependencies. `level` carries the processing order: an upstream repository has a
strictly lower level than anything depending on it, and the loader refuses a registry where a
dependency flows the wrong way.

**Declare each command** — `lint`, `typecheck`, `ut`, `it`, `ft`, `ct`, `e2e`. `null` means
"this kind of check does not exist here", and it is a prohibition, not a gap: a plan that asks
for an undeclared kind is refused before a human ever sees it. Never put a plausible but
unverified command in the registry — a test you believe you are running and that never runs is
worse than no test at all.

A few keys exist because their absence cost real hours: `reports` says where a command writes
its diagnostics when it does not write them to stdout, `containers` says what must be up before
the first test, `localFiles` says which ignored config files to copy into a fresh worktree,
`targeting` says how a runner accepts being pointed at specific files, and `withoutTests: true`
marks a repository that deliberately has no suite. `release` says where a publishable
repository keeps its version and how its tags are prefixed, and `bump` says how a downstream
repository adopts an upstream dev version.

Budgets, naming, the model and effort of each role, the agent image, the Slack allowlist and
the Jira transitions live in `redline.yaml`.

## Your writing voice

The closing phase publishes under **your own name** — a Slack message, a Jira comment. A
message that reads as machine-written is worse than no message at all, so the finalizer writes
with `~/.redline/voice.md`: a profile of how *you* write, derived from what you have actually
written. While it does not exist, the template is used and the finalizer is told the voice is
not calibrated, so it stays factual instead of imitating a style it does not know.

To produce yours, gather a real corpus — your own MR comments, Slack messages and commit
messages, a few hundred lines is plenty — and give Claude this prompt alongside it:

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

## Verify

| Command | What it answers |
|---|---|
| `bun run test` | is this **function** correct? |
| `bun run test:workflow` | does the **chain** hold end to end? scripted agents, real git, fake Jira, GitLab and Slack |
| `bun run typecheck` | — |

The workflow tests replace a dry-run flag, and replace it better: the agents are scripted
in-process through outpost's own harness, the fixture repositories are real repositories with
a real bare remote, and Jira, GitLab and Slack are local fake servers. Every scenario asserts
what actually happened — commits, tags, merge requests, messages.

**On the fixture repositories.** A git repository inside a git repository is a nested `.git`,
which git will not track without a submodule. They are described in `tests/fixtures/repos.ts`
and materialized per test in a temporary directory: real repositories, with a real bare
remote, different levels, an upstream/downstream dependency, a monorepo, and a suite that can
be made to fail on demand. To open them by hand: `bun run fixtures`.

## Out of scope, deliberately

**Merge request feedback** — collecting review comments, CI results and Slack threads, then
handling them on the same branch — does not exist yet; it is handled by hand.

**No semantic index.** Memory selection is a deterministic filter on the frontmatter, the
ticket's words and the repositories in scope, within a fixed budget: exact, free, debuggable,
never out of sync.

## Contributing

Start with [CONTRIBUTING.md](CONTRIBUTING.md).

## License

MIT — see [LICENSE](LICENSE).
