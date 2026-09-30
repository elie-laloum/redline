# Architecture

This page explains how the code is organised and the decisions that hold it together. The
[README](../README.md) describes what a run does; this page describes how.

## One rule

**Code decides, agents judge.** Anything done the same way on every run is TypeScript that can
be tested without a model: fetching, selecting, running commands, committing, counting budgets,
tagging, pushing, publishing. An agent is called only for a judgment, through a typed input and a
response schema, and its answer is checked by code before anything acts on it.

Redline delegates the machinery of agents and workflows to
[`@elie-laloum/outpost`](https://www.npmjs.com/package/@elie-laloum/outpost): workflows, tasks,
loop tasks, human interactions, checkpoints, the task cache, git worktrees, Docker sandboxes and
the Claude Code harness. Redline owns the process built on top of them.

## Layers

```
cli/        commands, questions, plain progress, dashboard
app/        composition root, phase driver, ledger, lock, settings, home, diagnostics
phases/     framing, delivery, closing — one outpost workflow each
workflow/   converge, interview, memo, pool — redline's workflow building blocks
agents/     one role per file: input, response schema, brief
domain/     pure rules and schemas, no I/O
ports/      interfaces the phases depend on
adapters/   Jira, GitLab, Slack, Figma, git, exec, checks, Claude, outpost sandboxes
```

- `domain/` holds pure functions and schemas: the configuration, the plan and its rules, scope,
  memory notes and selection, naming, versions, write zones, escalations, run events.
- Phases talk to the outside only through `ports/`, and `adapters/` implements them: a tracker,
  a forge, a chat, a design source, agents, sandboxes, a check runner.
- `app/context.ts` is the composition root. It loads the configuration and the secrets and
  builds each service lazily, so a command that never talks to Slack never needs its token.
  Tests replace any service through the same seam.
- Only `cli/tui/` imports OpenTUI.

## Phases and the driver

A run moves through a small state machine kept in the ledger, `~/.redline/tickets/<KEY>.yaml`:

```
framing → delivery → closing → done
    ↘         ↘          ↘
          escalated  (remembers the phase to resume)
```

`app/driver.ts` runs the workflow of the current phase, records its outcome in the ledger and
moves on. Each phase runs under its own outpost run id — `<KEY>/framing/<attempt>`,
`<KEY>/delivery/<generation>`, `<KEY>/closing/<attempt>` — with a checkpoint under
`~/.redline/runs/<KEY>/`. A workflow that stops for a question, a cancellation or a quota pause
returns to the caller; the next `resume` starts the same run id and outpost restores every
finished task.

| Phase | Tasks |
|---|---|
| framing | `ticket`, `figma`, `memory-broad`, `functional`, `scope`, `memory-targeted`, `technical`, `plan`, `review` |
| delivery | per repository: `<repo>.workspace`, `<repo>.tests`, `<repo>.code-<n>` per batch, `<repo>.code`, `<repo>.release` when a downstream repository in scope depends on it |
| closing | `memory-plan`, `memory-apply`, `prose`, `push-branches`, `merge-requests`, `slack`, `jira` |

Delivery chains the repositories by ascending level: a repository's workspace waits for the
previous repository to finish and for the release of every upstream it depends on.

**Reopening.** A plan review that amends or rejects starts a new framing attempt with the note
attached to the planner, the functional grill or the technical grill. Tasks upstream of what was
reopened are restored from the task cache, whose key is a digest of their inputs and whose
version is a digest of the briefs of the roles involved: editing a brief invalidates exactly the
tasks that use it.

**Versions.** A checkpoint's version is a digest of redline's version, outpost's version and every
brief. A checkpoint written by another version escalates as `environment` instead of crashing;
`resume --fresh` starts a new attempt and the cache restores what still holds.

## Bounded loops: `converge`

Every loop in redline is `workflow/converge.ts`, one outpost loop task with an ordered list of
gates. Each round, `make` produces a candidate, and the gates judge it in order:

| Verdict | Effect |
|---|---|
| `pass` | the next gate judges; after the last one, the loop is done |
| `feedback` | the gate spends one turn of its budget and the text goes back to `make` |
| `environment` | escalation at once, no turn spent |
| `arbitrage` | escalation at once: a human decides |

A gate that exceeds its own budget escalates as `convergence`. Budgets are per gate, so a
talkative adversary cannot use up the turns meant for a red run. Each verdict is published as a
`gate` event with the spent and total budget.

| Loop | Gates, in order |
|---|---|
| `<repo>.tests` | `zone` — only test files · `adversaire` — the test adversary · `rouge` — the tests run red, for the right reason |
| `<repo>.code` | `recours` — reverted test edits and appeals · `tests-modifies` — tests the arbiter changed still hold · `vert` — typecheck, lint and suites · `adversaire` — the code adversary |
| `plan` | `validite` — the plan rules |
| `memory-plan` | `validite` — the memory operations apply |
| `prose` | `publiable` — the texts can be published |

## Human interactions: `interview`

`workflow/interview.ts` turns a decision function into an outpost task with an `interaction`.
Each turn, `think` reads the transcript and either asks questions or returns a result. A question
makes the workflow wait for input; the CLI or the dashboard asks it and resumes the run with the
answer. The transcript is checkpointed, so an answered question is never asked twice. The
functional and technical grills are interviews with an agent behind `think`; the plan review is an
interview with plain code behind it.

## Agents

Each role in `agents/` declares its input, its response schema and its brief in
`prompts/<role>.md`. `ask()` renders the brief, runs Claude Code through outpost in the sandbox it
is given, validates the JSON answer against the schema, and reports every agent observation with
the task — and lane, for parallel scouts — that asked. The model and reasoning effort come from
`agents.default` and `agents.byRole`.

Agents work in two kinds of sandboxes:

- **Readers** — the scouts, the grills, the planner, the memory planner and the finalizer — run
  over the redline home: the memory and a short reading guide, with every registry repository
  mounted read-only under `/repos/<name>`. Anything a reader writes is discarded when it closes.
- **Delivery roles** — the test writer, the test adversary, the red checker, the developer, the
  arbiter and the code adversary — run over the repository's git worktree, on the ticket's
  branch. Only the test writer, the developer and the arbiter produce commits.

## Commits and write zones

Agents never commit. After each turn, `phases/delivery/commit.ts` keeps what belongs to the
role's zone — test files for the test writer and the arbiter, everything else for the developer —
reverts the rest, and commits with a message redline builds from the agent's stated intent and
the ticket key. What was reverted is fed back through the loop's first gate.

## Registry commands

Tests, typecheck, lint and installs run on the host, in the worktree, exactly as the registry
declares them. `adapters/exec.ts` watches two clocks: a ceiling (`commandSeconds`) and a silence
(`commandSilenceSeconds`), beyond which a command is treated as an infrastructure wait. Full output
goes to `~/.redline/logs/<KEY>/`. In a monorepo, checks are restricted to the packages the branch
touched. A forced exit kills the running commands.

## Releases

A repository that a downstream repository in scope depends on is released before the downstream
one starts: redline tags `<tagPrefix><version>-<KEY>-<n>` on the branch head, pushes the tag alone,
watches the declared CI jobs, and the downstream workspace applies the registry's `bump` command
with that version.

## Publication

Closing is not atomic across GitLab, Slack and Jira: a failure halfway leaves visible changes.
Each step is therefore idempotent, so a `resume` completes what is missing without repeating
what is done. Branches are pushed with `--force-with-lease`; a merge request is found by branch and
updated rather than opened twice; the Slack message is not reposted when the channel already has
it; bookmarks and the Jira comment are not duplicated; the transition is skipped when the ticket
already has the target status. `clear` removes local state and lists the remote traces it
leaves.

## Memory

The knowledge base is `~/.redline/memory/`: one Markdown note per file, with a frontmatter whose
scope decides its folder — `company`, `domains`, `capabilities`, `features`, `integrations`,
`repos`, `decisions`, `incidents`. Selection for a brief is deterministic — frontmatter, the
ticket's words and the repositories in scope, within `memory.selection` — once broadly before the
functional grill and once narrowed to the scope before the technical grill.

Contradicting the memory is a permitted outcome: scouts, grills and the developer report a note
their reading contradicts, with evidence. The memory planner receives those contradictions first,
with the plan and what was delivered, and proposes operations that the code checks before
applying them as a single commit to the home repository.

## Observability

Everything a run does is published on one typed channel, `RunEvent` in `domain/run-events.ts`:
phases, workflow events, agent observations, gate verdicts, registry commands and public actions.
The plain-text output and the dashboard are two listeners on it. See [tui.md](tui.md).

## Tests

- `tests/unit/` covers the pure rules and the adapters.
- `tests/workflow/` runs whole phases with agents scripted in-process through outpost's harness,
  real git repositories with a bare remote, and local fake Jira, GitLab and Slack servers.
- `tests/kit/` holds the scripted agents and the world they run in; `tests/fixtures/` describes the
  fixture repositories, materialized per test.
