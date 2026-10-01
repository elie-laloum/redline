# Terminal interface

`start` and `resume` open a full-screen dashboard of the run. This page records the decisions
behind it and the constraints it has to respect.

## Scope

- `start` and `resume` open the interface once pre-flight has passed (ticket fetch,
  authentication check, agent image confirmation and build); bringing pre-flight inside the
  interface is slice 5, with `init`. A home screen on a bare `redline` (runs list, new run,
  resume) comes later; `status` stays plain text.
- The interface is the default when stdout is a TTY. `--plain`, a pipe, CI or `nohup` keep the
  current clack output, which stays the reference fallback.
- For `start` and `resume`, the interface lives in the run's process. Closing it stops the run the
  way `Ctrl-C` does. Watching a run from another terminal is `show`, a separate read-only
  process (below); there is no `start --detach`.
- `init` opens the same interface on the configuration; [init.md](init.md) records its design.
- It is tuned for Linux and WSL2 under Bun. Other environments fall back to plain text without
  losing anything.
- The interface speaks French, like the task labels, the grill questions and the escalations.

## Stack

[OpenTUI](https://opentui.com), `@opentui/core` in imperative style: renderables whose
properties are set when an event arrives. No React or Solid binding, no JSX. Versions are pinned
exactly: the API still moves every week.

Only `src/cli/tui/` imports OpenTUI. Everything else talks to it through the two seams `start`
and `resume` already use: a `Prompter` for questions and a `Progress` that receives `RunEvent`s.

OpenTUI settings that are not negotiable:

| Setting | Why |
|---|---|
| `exitOnCtrlC: false`, `exitSignals: []` | redline keeps its two-stage stop. Raw mode delivers `Ctrl-C` as a keypress, which is routed to the same handler as `SIGINT`: first press stops cleanly, second kills the commands. |
| `consoleMode: "disabled"` | nothing in redline writes to the console during a run, and an overlay would hide real problems. |
| own `uncaughtException` / `unhandledRejection` handler that calls `destroy()` | OpenTUI's handlers swallow errors into an overlay and leave the terminal in raw mode. |
| `process.stdout.isTTY` checked by redline | OpenTUI writes escape sequences into a pipe without complaint. |
| journal and agent text capped, text deltas batched | open memory growth with many updating text nodes (anomalyco/opentui#1493). |

## Screen

The layout follows a dense operations dashboard, on a fixed dark palette whose colours are
tokens in a single file.

```
┌ header ─ ticket · title · phase · badges ─────────────────────────────────┐
├ banner ─ waiting for you · escalation · stopping · error (when relevant) ─┤
├ card ─────────┬ card ──────────┬ card ─────────────┬ card ───────────────┤
│ elapsed,      │ tokens in /    │ loop round and    │ repositories        │
│ phase, tasks  │ cache / out,   │ spent/budget per  │ delivered / total,  │
│ progress bar  │ sparkline      │ gate              │ current repository  │
├ tasks ─────────────────────────────────┬ inspector ─────────────────────┤
│ one row per task of the phase: status, │ selected task: active role,    │
│ attempts, round, duration, tokens      │ tool calls, live agent text,   │
│                                        │ last gate feedback, commands   │
├ journal ───────────────────────────────┴────────────────────────────────┤
│ task transitions · gate verdicts · registry commands · public actions    │
├ footer ─ key bindings ───────────────────────────────────────────────────┤
```

- The table lists every task seen, phase by phase under a heading each, the current phase's
  pending tasks included. Finished phases stay: on `resume` the event journal replays them. The
  selection follows the active task until the human navigates; `f` sticks it back.
- The inspector shows the selected task's result first — what it handed the next tasks, laid out
  for its kind of step (ticket, grill arbitrages, scope, plan, tests, commits, merge requests…),
  YAML for any other — then its gates, commands and agents. What agents said stays after their
  phase ends. Parallel agents inside one task (the scope scouts) appear as separate lanes, one per
  repository.
- The usage card shows the ticket's total tokens, with the current phase's underneath. The phase's
  are restored from its checkpoint when it starts, then counted from the workflow's usage events;
  every workflow run records what it spent in the ledger (`usage`, by run id), which gives the
  total even after a `resume`. The phase is announced from outpost's first checkpoint write,
  which carries every task's restored status: outpost emits no event for restored tasks. There is
  no cost: with account or OAuth authentication it means nothing, and a price table ages badly.
- A running registry command keeps a single journal line, whose elapsed time is updated on each
  heartbeat; its outcome is a second line.
- When a run ends — done, escalated, cancelled — or pre-flight fails, the screen freezes on the
  outcome, the banner gives the next command, and `q` quits. The plain-text report is then
  printed so it stays in the terminal's scrollback, merge request links included.

### Questions

Questions are panels that appear and disappear, not overlays:

- A grill question replaces the lower half of the screen, across the full width: title
  (`Grill fonctionnel · 2/5`), text, choices, and `Autre réponse…` which opens a multi-line text
  area. Header, banner, cards and a shortened task table stay visible.
- The plan review takes the whole body under the header and banner: scope and plan on the left,
  scrollable, and the decision on the right. The plan is indented plain text, not Markdown, so it
  is shown as such with its headings highlighted. A decision other than approval opens the note
  in the same column; the review's follow-up question receives that note without a second form.
- A panel takes focus when it appears. `Tab` gives the whole screen back to the dashboard to
  reread what the agents did — the banner says `Tab pour repondre` — and cycles back to the
  question. While the question has focus, the keys belong to it: only `Tab`, `PgUp` / `PgDn`,
  `Esc` and `Ctrl-C` stay global.
- A first `Ctrl-C` drops a pending question: the run ends as cancelled and `resume` asks it again.
- A pending question rings the terminal bell (BEL) and turns the banner on. No OS notification.

### Keys

| Key | Action |
|---|---|
| `↑` `↓` / `j` `k` | select a task |
| `Tab` | cycle focus: tasks → inspector → journal, and the question panel while one waits |
| `PgUp` `PgDn` | scroll the focused panel; in a question, its text or the plan |
| `f` | follow the active task again |
| `Enter` | confirm a choice |
| `Enter` in a text area | send the answer |
| `Shift+Enter`, `Alt+Enter`, `Ctrl-J` | new line in a text area. `Shift+Enter` only where the terminal reports it (kitty keyboard protocol); the other two work everywhere. |
| `Esc` | from the text area back to the choices |
| `q` | quit; during a run it asks for confirmation in the banner, then behaves like a first `Ctrl-C` |
| `Ctrl-C` | first press stops cleanly, second kills the commands |

The mouse is on: the wheel scrolls, a click selects a task. Copying text needs `Shift` + drag.

## Run events

Everything the interface shows comes from one typed channel, `RunEvent`
(`src/domain/run-events.ts`), handed to the engine as an observer. The engine never knows who
listens; clack ignores what it cannot show.

| Event | Emitted by | Carries |
|---|---|---|
| `phase` | driver, before each workflow starts | phase, every task key, repositories in scope |
| `output` | driver, on each checkpoint write | a finished task's value, as its checkpoint keeps it |
| `workflow` | outpost, through the driver | the raw `WorkflowEvent` (task status, loop round, usage, cache, input request…) |
| `question` | the session, before asking the human | the request as asked: outpost's input request event does not carry it |
| `agent` | `ask()` | `{ task, lane? }`, role, the raw `AgentObservation` |
| `gate` | `converge`, after each verdict | task, gate, round, verdict, spent / budget, feedback text; the budget is null when rebuilt from a checkpoint |
| `command` | registry checks and dependency installs | task, label, command, start / progress / end, exit code, log path |
| `publication` | release and closing | tag, pipeline, push, merge request, Slack, Jira — with a link when there is one |
| `warning` | the session and the memory step | what the run carries on without: a memory that would not pull or push |
| `preflight` | `start` and `resume` — planned, slice 5 | step, status, detail |

Agent observations carry the task that asked explicitly: `ask()` gets its source from the
session it runs in, so parallel agents are never attributed by guesswork.

## Event journal

A run's process used to take everything it emitted with it: agent text, registry commands and the
journal were gone once it exited, and checkpoints keep only task statuses, values, refused gate
feedback and the phase's total tokens. The event journal keeps the rest
(`src/app/event-journal.ts`).

- Every session appends to `runs/<KEY>/events.jsonl`, with the dashboard or `--plain` alike: a
  line when it starts, with its pid; one line per `RunEvent`, with its time; a line with its
  outcome when it ends. All phases and resumes follow one another in the one file.
- Only what the screen shows is kept. Agent text deltas are joined over 250 ms, flushed before
  any other event so nothing overtakes them; reasoning, raw output and tool output are dropped;
  a tool call keeps its string arguments, cut at 400 characters. A task value outpost hands
  again at each start of the workflow is written once.
- Writing the journal never fails a run: after a first error, the session stops writing it.
- It is not tracked in the home's git repository, and `clear` deletes it with the rest of the
  run.
- The reducer takes each event's time from its line, so a replay shows the durations the live
  screen showed.
- The dashboard of `start` and `resume` replays the journal before its session starts, then
  clears any question an earlier session left pending.
- A run from before the journal has its history rebuilt from its ledger and checkpoints
  (`src/app/run-history.ts`): every phase with its tasks and their durations on disk, what they
  handed on, their errors, the gate feedback of refused rounds — without the budget, which the
  checkpoint does not keep — and the public actions their values record. The first session that
  resumes such a run writes that history at the head of the journal.

## Viewing a run: `show`

`redline show [ticket]` opens the same screen, read-only, on a run that is finished, escalated,
interrupted, or running in another terminal (`src/cli/commands/show.ts`).

- It is a separate process that drives nothing: it never calls the driver, never takes the
  ticket's lock and writes nothing. It reads only the home's paths, never the settings or the
  tokens. `q`, `Esc` and `Ctrl-C` close the viewer at once and never touch the run.
- It replays the journal, then follows it: a watch on the run's directory, with a 500 ms poll as
  a fallback, since inotify is unreliable on `/mnt/c` under WSL. A run is running while the pid
  in `locks/<KEY>.json` is alive; `ledger.active` is null while a run waits for an answer, so it
  cannot tell. A session line starts the screen again, so a `resume` launched elsewhere while
  `show` is open is followed.
- How a run ended comes from the last session's outcome line, said as the run's own dashboard
  says it. A session without one whose process is gone died: the banner says so with its pid,
  the tasks it was running are shown interrupted, and the next step is `resume`.
- A question pending in the other terminal is shown in the inspector of its task, without
  controls; the banner says it waits in the other terminal, with its pid. The header carries a
  `LECTURE SEULE` badge.
- Without a ticket, it lists the runs — running ones first, then the most recently touched —
  with their state and age, refreshed every two seconds. Typing filters the list, `Enter` opens a
  run, `q` from a run goes back to the list, and `Esc` or `q` on an empty filter leaves.
- A run from before the journal is shown rebuilt, as above; the banner says that agent text and
  the journal are not there, and the clock counts from the ledger's start.
- Without a TTY, `show` refuses and points at `status <ticket>`, which stays plain text.

## View model

`src/cli/dashboard/model.ts` is a pure reducer: `RunEvent` in, dashboard state out, with the
time passed in. It holds no OpenTUI types and is the only part under unit tests, with
`src/cli/dashboard/watch.ts`, which tells `show` whether a run is running and how it ended.
Renderables only mirror its state.

`src/cli/tui/board.ts` holds what the run's dashboard and `show` share: the state, the screen,
the navigation keys and the clock. `dashboard.ts` adds the question panels and the run's stop
keys; `viewer.ts` adds only the keys that leave.

## Slices

Slices 1 to 5 are in place, except pre-flight inside the dashboard of `start` and `resume`: they
still check the runtime, the image and the credentials in plain text before opening it.

1. `RunEvent` channel, agent attribution, gate / command / publication events, view model.
   Clack output unchanged.
2. Read-only dashboard for `start` and `resume`, `--plain`, TTY detection.
3. Question panels, plan review, bell.
4. Event journal, `show`, and `resume` replaying the journal.
5. `init` ([init.md](init.md)): every section of the configuration, the image built and tested
   from it. `start` and `resume` do not reuse its sections for their pre-flight yet.
