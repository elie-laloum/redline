# Changelog

All notable changes to redline. Versions follow [semantic versioning](https://semver.org/);
releases are tagged `v<version>` and published to npm as
[`@elie-laloum/redline`](https://www.npmjs.com/package/@elie-laloum/redline).

## Unreleased — 4.0.0

### Breaking

- `redline auth` is removed: `init` sets how agents authenticate, in its Claude section. Without a
  terminal, set `agents.authentication` in `redline.yaml` and the token in `.env`.
- `--auth` leaves `start` and `resume`: the mode is `agents.authentication`, and nothing else.
- `redline.yaml` holds only overrides of the package defaults, and an existing one is reduced to
  them the first time it is read (see Changed).
- `start` and `resume` refuse to run without a personal `repositories.yaml`, and while a token of
  a service that is on is missing — `FIGMA_TOKEN` included, while Figma is on.

### Added

- A full-screen terminal dashboard for `start` and `resume`: the tasks of every phase seen, the
  ticket's tokens, the loop's spent budget per gate, the repositories delivered, the selected
  task's result, gates, commands and live agents, and a journal of verdicts, commands and public
  actions. `--plain`, a pipe or CI keep the plain-text output. See [docs/tui.md](docs/tui.md).
- Grill questions and the plan review are answered in the dashboard's panels, and a pending
  question rings the terminal bell. A first `Ctrl-C` drops a pending question; `resume` asks it
  again.
- The inspector shows what each finished task handed the next ones, and phases finished before a
  `resume` stay on screen.
- `show [ticket]` opens a run's dashboard read-only: a finished, escalated or interrupted run,
  or one running in another terminal, followed live. Without a ticket, it lists the runs. A
  question pending in the other terminal is shown without controls, and leaving never touches the
  run.
- Every session writes what the run does to `runs/<KEY>/events.jsonl`, with the dashboard or
  `--plain`: `show` and the next `resume` replay it, agent text, commands and gate feedback
  included. A run from before the journal is rebuilt from its checkpoints.
- One typed event channel, `RunEvent`, carries everything a run does: phases, workflow events,
  agent observations attributed to the task and lane that asked, gate verdicts with their budget,
  registry commands with a heartbeat, and public actions with their links.
- The ledger records the tokens each workflow run spent, so the ticket's total survives a
  `resume`.
- `services.slack`, `services.figma` and `services.jiraWrites` in `redline.yaml` switch off the
  Slack channel and message, the mockups, or the Jira transition and comment. The finalizer then
  writes no text for a channel that is off.
- `check` asks GitLab, Slack and Figma who each token belongs to, as it already asked Jira, and
  fails on a missing GitLab or Slack scope or a Slack bot token.
- The memory can live in a git repository of its own, which a team can share:
  `memory.repository` (a URL redline clones into the home) or `memory.path` (an existing clone).
  Runs pull it before framing and before applying notes, commit under the human's identity and
  push; a failure leaves the notes local with a warning. Reader agents get it mounted read-only.
- A `warning` run event: the journal and the plain output show what a run carries on without.
- `init` sets redline up on a full screen, section by section, each change written as soon as it
  is made: Jira, GitLab, Slack and Figma tokens, tested against their service; the service
  switches; the agent image, built and tested from the screen; Claude, with `claude setup-token`
  run in the agent image and its token read back; the memory's repository; the registry, a
  repository added from its checkout with its identity read from it and its commands typed and
  tried; the voice, in `$EDITOR`; every other setting, laid out from the schema, with its default
  and a reset; and the full check. See [docs/init.md](docs/init.md).
- `start` and `resume` open their dashboard at once and run pre-flight inside it, one journal
  line per step; a missing agent image is asked about in a question panel and built with its
  output in the journal. A failure freezes the screen on its cause, then is printed once the
  terminal is back. `--plain` is unchanged.
- `CHANGELOG.md`.

### Changed

- `~/.redline/redline.yaml` holds only overrides: every key it does not set comes from the
  package's defaults, merged map by map, a list replacing the default list whole. New defaults —
  `sandbox.image` changes with every release — now reach existing homes. A file written before,
  a full copy of the template, is reduced once to what differs from the defaults, without the
  image, and the original is kept as `redline.yaml.3.bak`.
- The package's defaults invite nobody to Slack and set no Jira transition per squad: the
  examples the template carried are comments now.
- `start` and `resume` check the tokens of the services that are on before anything runs:
  Jira and GitLab always, Slack and Figma while they are on. `FIGMA_TOKEN` is required while
  Figma is on; without it, switch Figma off. `check` ignores the services that are off.
- Without `~/.redline/repositories.yaml`, `start` and `resume` refuse to run and `check` fails;
  the demo registry is no longer a silent fallback.

### Fixed

- A missing Slack token no longer fails a run after its merge requests are open, leaving the
  Jira transition undone: pre-flight reports it before anything runs.
- What one phase hands the next — the approved framing, the delivered repositories, the
  publication — is validated against a schema when the ledger is read back, and a mismatch names
  the field and path instead of failing deep inside a phase.
- `clear` no longer stops on a publication it cannot read: it cleans up and lists the remote
  traces to check by hand.

### Documentation

- The README is rewritten for the CLI built on
  [`@elie-laloum/outpost`](https://www.npmjs.com/package/@elie-laloum/outpost), with a setup
  guide and an architecture page. Documentation is now in English only: the French README and
  setup guide are removed.
- Removed the pages and eval cases left from the Claude Code plugin: the historical autopilot
  reference, the live-shell demo, and `evals/`, which no code ran.

## 3.1.0 — 2026-09-30

### Added

- `redline auth [account|oauth|key]` shows or chooses how agents authenticate to Claude: the
  machine's Claude login, a `claude setup-token` token, or an API key. It writes the mode into
  `redline.yaml` and the missing token into `~/.redline/.env`. `start` and `resume` take
  `--auth <mode>` for one run, and `check` verifies the active mode's credential.
- `start` and `resume` check that a container runtime answers — starting Colima when needed — and
  that the agent image exists, and offer to build it.
- Agents receive the tickets the ticket points to: parent, subtasks, issue links and `/browse/`
  links to the same Jira site, as context only.
- The `--notes` given to `start` reach every agent, not only the functional grill.
- The planner receives the grills' questions and answers verbatim, and the human's answer
  prevails over a summary that distorts it.
- The package is published to npm as `@elie-laloum/redline` from the GitHub mirror, whose CI runs
  the typecheck, unit and workflow tests.

### Fixed

- The `.env` of the directory redline is launched from is never loaded: it used to override the
  tokens of `~/.redline/.env`.
- Outpost's scratch folders live under `~/.redline/tmp`, which Colima shares with its VM.
- A refused Jira token, a missing ticket and Docker daemon errors are reported with their actual
  cause instead of a generic failure.
- A bulleted list of acceptance criteria keeps every item, not only the first.

## 3.0.0 — 2026-09-30

Redline is rebuilt as a Bun CLI on
[`@elie-laloum/outpost`](https://www.npmjs.com/package/@elie-laloum/outpost) workflows. The Claude
Code plugin, its MCP server and the live shell are removed.

### Breaking

- `bun redline start <ticket>` replaces the `/autopilot-start` skill, and Bun replaces Node and
  pnpm.
- Configuration and state move from `~/.autopilot` to `~/.redline`: `redline.yaml`,
  `repositories.yaml`, `.env` and `voice.md` live there. `redline migrate-home` copies the memory
  of an autopilot installation.
- Agents run Claude Code in Docker containers built from `docker/agent.Dockerfile`, instead of
  inside the host's Claude Code session.
- The live shell and the evals runner are removed.

### Added

- Framing, delivery and closing as three durable outpost workflows, checkpointed under
  `~/.redline/runs/<KEY>/`, with a ledger per ticket and a task cache that restores finished work
  after a reopen.
- Bounded loops with one budget per gate, and three kinds of escalation: `convergence`,
  `environment` and `arbitrage`. `resume --fresh --note` reopens the escalated task with a new
  budget.
- Durable interviews for the grills and the plan review; `Amend` reruns the planner alone and
  `Reject` reopens a grill.
- The developer works in batches, appeals disputed tests to an arbiter, and a test contested too
  often escalates.
- Upstream repositories are released as dev tags whose CI is watched, and downstream
  repositories adopt that version before their turn.
- Closing applies the memory plan as one commit, then publishes idempotently: push, draft merge
  requests with cross links, a Slack channel limited to the allowlist, a Jira comment and
  transition.
- Checks in turbo and lerna repositories are restricted to the packages the branch touched.
- Commands: `start`, `resume`, `status`, `clear`, `check`, `bench`, `image build`,
  `image doctor`, `migrate-home`.

## 2.0.0 — 2026-09-15

Autopilot, a Claude Code plugin: an MCP server with the workflow's deterministic tools, fifteen
agent definitions and the `/autopilot-start` skill, a live shell to follow a run, one eval suite
per agent, unit tests and twelve end-to-end workflow scenarios. On 2026-09-21 the project took
the public name Redline, with its GitHub mirror.
