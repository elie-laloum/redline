# autopilot

An autonomous development workflow for [Claude Code](https://claude.com/claude-code). It takes
a Jira ticket and carries it to merge requests: scoping, one human gate, adversarial TDD
repository by repository in dependency order, memory capitalization, then publication in a
single block.

```
/autopilot-start <jira-url-or-key> [--notes "…"] [--figma <url>…] [--live]
```

On a ticket that already has a state file, the command **resumes** instead of starting over.

> **Read this first.** This is one developer's working system, opened up because the design
> may be useful to others — not a product. It assumes Jira, GitLab and Slack, and it was
> shaped against a specific codebase. Nothing here auto-detects your setup: repositories,
> commands and CI jobs are declared by hand in a registry file. Expect to adapt it, not to
> install it. The agent prompts and the docs under `DESIGN.md` and `PRODUCT.md` are in French.

## The three ideas that carry the rest

**Any action performed on every run, the same way, is a tool — not an agent instruction.** A
tool is deterministic, testable, and costs no context. That is why there are 59 of them, and
why most of the surface area can be tested without an LLM in the loop.

**An agent may only write to one zone.** The `test-writer` writes tests, the `developer`
writes code and never a test, the two adversaries write nothing, the `memory-writer` is alone
in `memory/`, the `finalizer` is alone on a remote. An agent that needed two zones would be
badly cut.

**Contradicting the memory is a permitted outcome.** The scouts and the `developer` are given
a `contradict-memory` tool for when what they read does not match the actual code. That is the
mechanism that keeps the knowledge base from rotting.

## The loop

Three phases. **Scoping** (1→9) runs once and writes nothing outside the ticket state.
**Implementation** (10) is replayed for each repository, by ascending `level`, one repository
finished before the next is opened. **Capitalization and publication** (11→13) run once at the
end.

| # | Actor | Produces |
|---|---|---|
| 1-2 | tools | the ticket, the mockups (optional) |
| 3 | `doc-scout` | relevant memory, broad pass |
| 4 | `functional-grill` | functional rulings, unbounded turns |
| 5 | `scope-scout` | impacted repositories, with evidence |
| 6 | `doc-scout` | memory narrowed to the selected repositories |
| 7 | `technical-grill` | technical rulings |
| 8 | `planner` | the plan and the two exit checklists |
| 9 | **human gate** | **the only one in the workflow** |
| 10.1→10.7 | `test-writer` → `test-adversary` → `red-checker` → `developer` → `green-checker` → `code-adversary` → upstream publication | per repository |
| 11-12 | `memory-planner`, `memory-writer` | the memory plan, a single commit |
| 13 | `finalizer` | N cross-referenced MRs, one channel, one transition |

Once step 9 is approved, everything after it runs without further validation — including the
public, irreversible actions of step 13. The only interruptions left are escalations.

**Step 10.3 exists for exactly one reason**: it is the only guard against a test that passes
for the wrong reason. Those tests are green at the end, and therefore invisible forever.

## Where things live

**The project holds the code and the configuration** — it clones, it reads, it reviews.

```
autopilot/
├── autopilot.example.yaml      budgets, timeouts, naming, slack allowlist, jira transitions
├── repositories.example.yaml   the registry: level, commands, ci jobs, dependencies
├── .env.example                the tokens
├── plugins/autopilot/          the 15 agents, the skill, the voice rules, the tool server
│   └── evals/                  one eval suite per agent
├── tools/live-shell/           the live-mode app, tanstack start in ssr
└── tests/                      unit/, workflow/, fixtures/
```

The three `*.example.*` files are templates. Copy each one to its real name — `autopilot.yaml`,
`repositories.yaml`, `.env` — and fill it in. The real files are gitignored: they describe your
infrastructure and your tokens, so they are never published. When one is missing, the loader
falls back to its template, which is what lets a fresh clone run its test suite and
`pnpm config:check` before anything has been configured.

**`~/.autopilot` holds the knowledge and the state** — it does not clone, it accumulates.

```
~/.autopilot/
├── memory/                       the knowledge base, versioned
├── tickets/<ticket-id>.yaml      the tracking state, versioned
├── events/<ticket-id>.jsonl      the live-mode stream, disposable
├── locks/<ticket-id>             the run lock, disposable
└── worktrees/<ticket-id>/<repo>/ the worktrees, disposable
```

It is a git repository, but **everything in it is gitignored except `memory/` and `tickets/`**:
what gets versioned is what still has value after the run.

## Requirements

- **Node 22.18+** — the tool server runs TypeScript natively, with no build step.
- **Claude Code**, which loads this repository as a local plugin marketplace.
- **Jira Cloud**, **GitLab**, **Slack** — with a personal access token for each.
- **Figma** is optional. Without a token the `get-figma-*` tools report "no mockup" and the run
  continues; many tickets have none.

The Slack token is a **user** token (`xoxp-`), not a bot token: every action appears under your
own name. With a bot token the channel would be created by an app, and the point of the whole
thing — a colleague seeing that *you* opened the channel — falls away.

## Install

```
pnpm install
cp .env.example .env                                # then fill in the tokens
cp autopilot.example.yaml autopilot.yaml            # budgets, naming, allowlist
cp repositories.example.yaml repositories.yaml      # your repositories
pnpm config:check
```

`pnpm config:check` is the one command to run after any configuration change: it reads the
config, the registry and the environment, and reports what would break a run far from its
cause — an unreadable setting, an incoherent registry, a missing token.

## Adapting it to your own stack

Almost all of the adaptation happens in `repositories.yaml`, and none of it in code.

**Declare each repository** with its `level`, its local path, its GitLab project, its base
branch and its dependencies. `level` carries the processing order: an upstream repository has a
strictly lower level than anything depending on it, and the loader refuses a registry where a
dependency flows the wrong way.

**Declare each command** — `lint`, `typecheck`, `ut`, `it`, `ft`, `ct`, `e2e`. `null` means
"this kind of check does not exist here", and it is a prohibition, not a gap: an agent that
finds `null` escalates instead of inventing a command. Never put a plausible but unverified
command in the registry — a test you believe you are running and that never runs is worse than
no test at all.

A few keys exist because their absence cost real hours: `reports` says where a command writes
its diagnostics when it does not write them to stdout, `containers` says what must be up before
the first test, `localFiles` says which gitignored config files to carry into a fresh worktree,
`targeting` says how a runner accepts being pointed at specific files, and `withoutTests: true`
marks a repository that deliberately has no suite — so that commands silently disappearing from
the registry is caught by the test suite rather than by a run.

Naming, branch and MR templates, Jira transitions and the Slack allowlist live in
`autopilot.yaml`. Committer identity is `git.committer` there; leave it commented out and
commits are signed with the machine's own git identity.

## Verify

| Command | What it answers |
|---|---|
| `pnpm test` | is this **function** correct? 160 tests |
| `pnpm test:workflow` | does the **chain** hold end to end? 12 scenarios in a sandbox |
| `pnpm eval` | does this **agent** judge well? one suite per agent |
| `pnpm typecheck` | — |

There is **no** `--dry-run` in autopilot: the `tests/workflow/` sandbox replaces it, and
replaces it better. A flag can be bypassed and verifies nothing; a sandbox verifies what
actually happened. Git is not mocked in it either — the fake repositories are real
repositories, with a real bare remote.

## Measure

Three counters, in the `metrics` block of the tracking file:

- **`mrFeedbackCount`** — the primary indicator: it measures the effect of incrementing the
  memory. Filled in **by hand** for as long as workflow 2 does not exist.
- **`humanInterventions`** — the gate, escalations, answers to `ask-user`.
- **`loopTurnsTotal`** — the sum of the loop counters.

v2 is allowed to be slower than v1 if it is more rigorous.

## Out of scope, deliberately

**Workflow 2** — collecting feedback from Slack, Jira, MR threads and CI, handling it on the
same branch, then archiving — does not exist. Until it does, MR feedback is handled by hand.
The `workflow2` fields of the tracking file and the `jira.workflow2` block of `autopilot.yaml`
are already there: the day it gets wired in, no already-processed ticket will need migrating.

**No semantic index** either. Memory search is a deterministic filter on the frontmatter plus a
grep: exact, free, debuggable, never out of sync. An index gets added the day deterministic
search stops being enough.

## Two deliberate deviations

**On where the evals live.** `claude plugin eval` only resolves its case directory **under the
plugin**, and targeting the plugin by name runs it against the installed copy in the cache
rather than the working tree — so it would never see the agent prompts you just edited. The
suites therefore live in `plugins/autopilot/evals/`, declared by `experimental.evals` in the
manifest. It is the only location where `pnpm eval` evaluates the code in front of you.

**On the fixture repositories.** A git repository **inside** a git repository is a nested
`.git`, which git will not track without a submodule or a rename restored at startup — that is,
a generator, only less readable. They are described in `tests/fixtures/repos.ts` and
materialized at runtime, in a temporary directory per case: four real repositories, with a real
**bare** remote, different `level`s, an upstream/downstream dependency, a monorepo, and a suite
that can be made to fail on demand. Each test starts from a fresh repository, inheriting
nothing from a tag a previous test pushed.

To open them by hand:

```
pnpm fixtures          # writes them to tests/.fixtures/, gitignored
```

## License

MIT — see [LICENSE](LICENSE).
