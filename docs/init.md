# Setup screen

`redline init` opens the terminal interface on redline's configuration: service tokens, how
agents authenticate to Claude, which services a run uses, the memory repository, the agent
image, the registry, the writing voice and the settings. This page records the decisions behind
it.

## Scope

- `init` is how a human sets redline up, and how they change its configuration later. It
  replaces `redline auth`, and `--auth` leaves `start` and `resume`: the authentication mode is
  `agents.authentication` in `redline.yaml` and nothing else. Both removals break the CLI, so
  `init` ships in 4.0.0. `check` stays, for scripts and CI.
- The same screen opens on every launch, filled in from what exists. Each section is written as
  soon as it is validated, the way `writeSetting` and `writeSecret` already work: a `Ctrl-C`
  loses at most the section being edited.
- Without a TTY, `init` refuses and points at the manual path: `.env`, `redline.yaml`,
  `repositories.yaml`. There is no second assistant in clack.
- `init` reads every file even when it is invalid, and shows the error in that file's section.
  It cannot go through `createContext`, which fails on the first invalid file.
- `init` creates the home's layout when it is missing, as `start` does.
- While a run holds a ticket's lock, the memory section is read-only. Every other change applies
  to the next run: a run loads its configuration once, when it starts.
- The interface speaks French, like the dashboard, and shares its stack and constraints
  ([tui.md](tui.md)).

## Screen

The sections are listed on the left with their state — configured, missing or failing, or the
package default in use — and the selected section fills the right. The first launch opens on the
first incomplete section, and `Suivant` walks through the incomplete ones.

| Section | What it sets | Where it writes |
|---|---|---|
| Jira | site, e-mail, API token | `.env` |
| GitLab | host, token | `.env` |
| Slack | token | `.env` |
| Figma | token | `.env` |
| Services | Slack, Figma and Jira writes on or off | `redline.yaml` |
| Image | the agent image, built with its output shown | Docker |
| Claude | mode and credential | `redline.yaml`, `.env` |
| Memory | the memory repository | `redline.yaml`, `~/.redline/memory` |
| Registry | the repositories and their commands | `repositories.yaml` |
| Voice | the writing voice | `voice.md` |
| Settings | every other key of `redline.yaml` | `redline.yaml` |
| Check | the full `check` | — |

Claude comes after Image: its credential is obtained and tested inside the agent image.

## Tokens

- Tokens stay in `~/.redline/.env`, written atomically with owner-only permissions. A variable
  exported in the shell still overrides its line; the section shows a badge when it does.
- They are masked except for their last four characters.
- Each connection is tested against its service when its section is validated, and written even
  when the test fails, with the cause shown:

  | Service | Test |
  |---|---|
  | Jira | `GET /rest/api/3/myself` |
  | GitLab | `GET /api/v4/user`, and the token's scopes include `api` and `write_repository` |
  | Slack | `auth.test`, and the scopes it reports include the ones [setup.md](setup.md) lists |
  | Figma | `GET /v1/me` |

  `check` runs the same tests. Today it only tests Jira.

## Services

- `services.slack`, `services.figma` and `services.jiraWrites` in `redline.yaml`, global, all on
  by default.
- Slack off: the closing phase creates no channel and posts no message, and the finalizer writes
  no Slack text. Figma off: framing reads no mockups, and `start --figma` refuses. Jira writes
  off: no transition and no comment; the ticket is still read.
- Jira and GitLab cannot be switched off: they are where the ticket comes from and where the
  code goes.
- `start` and `resume` check the tokens of the services that are on during pre-flight, before
  anything runs. Today a missing Slack token fails the run after the merge requests are open,
  and the Jira transition, which comes after Slack, never happens.
- `check` ignores the services that are off.

## Claude

| Mode | What `init` does |
|---|---|
| `oauth` | runs `claude setup-token` in the agent image (`docker run -it --rm`), where `claude` is always installed, reads the token from its output and writes it to `.env`. If the token cannot be read, a field takes it pasted. |
| `key` | a field for the API key. |
| `account` | looks for the machine's Claude credentials. Without them, it explains why and offers `oauth`. |

`account` suits people who already use Claude Code on the machine, whose login stays fresh
through that use. Outpost copies `~/.claude/.credentials.json` into each container's temporary
home and writes nothing back, so a login created for redline alone would never be refreshed on
the host. A macOS login kept in the Keychain is not a file outpost can read either.

Once the credential is in place, the section tests it for real: Claude has to answer inside the
container, as `image doctor` checks.

## Settings

- The personal `redline.yaml` holds only what differs from the package defaults, merged over
  them; a list replaces the default list whole. `init` writes only the keys the human touched.
  Today the first write copies the whole template, and from then on new defaults stop reaching
  the user — `sandbox.image` changes with every release.
- The first 4.0 run reduces an existing personal file to its differences: keys equal to the
  current defaults are removed, `sandbox.image` always is, and the rest stays as overrides.
- Every key has a form field, generated from the schema. A field shows the default and whether it
  is overridden, and can be reset to the default.

## Registry

- The demo registry is no longer a silent fallback. Without a personal `repositories.yaml`,
  `start` refuses and points at `init`, and `check` fails. Tests point at the template
  explicitly.
- A repository is added from its checkout's path. `init` fills in what it can read without
  guessing: `gitlabProject` from the remote, the base branch, the package manager from the
  lockfile, `packageName`. It proposes `level` from `dependsOn`, and the proposal can be edited.
- Commands are typed by hand, never inferred: the rule of [setup.md](setup.md) stands. `Essayer`
  runs a command in the checkout and shows its duration, its longest silence and its exit code,
  as `bench` does.
- The advanced keys — `localFiles`, `containers`, `reports`, `targeting`, `release`, `bump` — are
  edited in `$EDITOR`, and the file is validated when the editor closes.

## Voice

`init` shows the procedure of [setup.md](setup.md) and opens `voice.md` in `$EDITOR`. It
generates nothing.

## Memory

The memory can live in its own git repository, which several people can share.

- Given a URL, redline clones it into `~/.redline/memory`. Given a path, it uses that existing
  clone as it is. Given neither, the memory stays in the home's repository, as today. Either
  way, `memory.repository` or `memory.path` in `redline.yaml` records the choice.
- The notes sit at the repository's root: `company/`, `domains/`, `repos/`…
- When a repository is set while `~/.redline/memory` already holds notes, `init` offers to import
  them — copied without overwriting a note, as `migrate-home` does — then commits and pushes. The
  old folder is archived.
- Every `start` and `resume` pulls with rebase before framing, and again just before the closing
  phase applies its memory operations. After applying them, redline commits and pushes. A
  rejected push, a conflict or an unreachable remote leaves the commit local with a warning: the
  run never fails on it.
- Memory commits carry the human's git identity, or `git.committer`, with the message
  `memory: <KEY>`. Tickets stay in the home's repository, committed at the same point as today.
- Reader agents see the memory through a read-only bind mount at `/workspace/memory`, the path
  they see today, so prompts and briefs do not change. They see the live clone instead of the
  home's last commit. Outpost's container provider already takes volumes: the change is in
  redline only. The local provider, used by the tests, gets it as a host path.

## Keys

| Key | Action |
|---|---|
| `↑` `↓` / `j` `k` | choose a section, or a line of the section |
| `Enter` | open the section; edit a field, flip a switch, change a choice, run an action |
| `←` `→` | change a choice |
| `Esc` | leave a field without saving, a sub-page, then the section |
| `r` | put a setting back to its default |
| `s` | the next section that needs you |
| `PgUp` `PgDn` | scroll a long section |
| `q`, `Ctrl-C` | leave |

A field opens a line at the bottom of the section: `Enter` saves, `Esc` leaves it. A token typed
there stays out of sight; only its length shows.

## Handing the terminal over

`$EDITOR`, the image build, `doctor` and `claude setup-token` run in the real terminal, as from a
shell: `suspend()` leaves the alternate screen and raw mode, the child runs, and `resume()` brings
the screen back. The build and `doctor` wait for Enter so their output can be read.
`claude setup-token` runs in a pseudo-terminal of its own (`Bun.Terminal`), 240 columns wide so a
token is never wrapped: what it prints reaches the terminal and is kept, and the token is read
from it, colours and cursor moves left out. When none is found, the output stays on screen until
Enter, to be copied into the field by hand.

## Where it lives

| File | Role |
|---|---|
| `src/cli/commands/init.ts` | lays the home out, opens the terminal |
| `src/cli/tui/setup/setup.ts` | the state: what was read, what the services answered, what the human typed |
| `src/cli/tui/setup/pages.ts` | each section's lines and actions |
| `src/cli/tui/setup/screen.ts` | the sections, the lines, the edit line and the keys |
| `src/cli/tui/handoff.ts` | the terminal handed to a child, and the token read back |
| `src/cli/setup/sections.ts`, `fields.ts` | each section's state, the settings laid out from their schema — under unit tests |
| `src/app/setup.ts` | the home read even when a file is invalid |
| `src/app/connections.ts`, `registry-file.ts`, `memory-repository.ts` | token tests, registry writes, the memory's repository — shared with `check` and runs |

## Order

The event journal and `show` came first, as slice 4 of the interface ([tui.md](tui.md)), then
`init` as slice 5, with the pre-flight of `start` and `resume` brought inside their dashboard:
the same checks, each a journal line, and the image built there when it is missing.
