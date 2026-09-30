# Terminal interface

`start` and `resume` open a full-screen dashboard of the run. This page records the decisions
behind it and the constraints it has to respect.

## Scope

- `start` and `resume` open the interface as soon as they are launched, pre-flight included
  (ticket fetch, authentication check, agent image confirmation and build). A home screen on a
  bare `redline` (runs list, new run, resume) comes later; `status` stays plain text.
- The interface is the default when stdout is a TTY. `--plain`, a pipe, CI or `nohup` keep the
  current clack output, which stays the reference fallback.
- The interface lives in the run's process. Closing it stops the run the way `Ctrl-C` does;
  checkpoints and `resume` cover everything a detached viewer would.
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

- The table lists every task of the current phase from the start, pending ones included. The
  selection follows the active task until the human navigates; `f` sticks it back.
- The inspector shows the selected task's agents. Parallel agents inside one task (the scope
  scouts) appear as separate lanes, one per repository.
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
  area. Header, banner and cards stay visible.
- The plan review takes the whole body under the header and banner: the plan as scrollable
  Markdown on the left, Approve / Amend / Reject and the note on the right. The dashboard comes
  back once the decision is sent.
- A panel takes focus when it appears; `Tab` moves to the table, inspector and journal to reread
  what the agents did, then back.
- A pending question rings the terminal bell (BEL) and turns the banner on. No OS notification.

### Keys

| Key | Action |
|---|---|
| `↑` `↓` / `j` `k` | select a task |
| `Tab` | cycle focus: tasks → inspector → journal → question panel |
| `PgUp` `PgDn` | scroll the focused panel |
| `f` | follow the active task again |
| `Enter` | confirm a choice |
| `Ctrl+Shift+Enter`, `Ctrl-S` | send a text area. The first only works where the terminal reports it (kitty keyboard protocol); `Ctrl-S` always does. |
| `Esc` | leave `Autre réponse…` |
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
| `workflow` | outpost, through the driver | the raw `WorkflowEvent` (task status, loop round, usage, cache, input request…) |
| `agent` | `ask()` | `{ task, lane? }`, role, the raw `AgentObservation` |
| `gate` | `converge`, after each verdict | task, gate, round, verdict, spent / budget, feedback text |
| `command` | registry checks and dependency installs | task, label, command, start / progress / end, exit code, log path |
| `publication` | release and closing | tag, pipeline, push, merge request, Slack, Jira — with a link when there is one |
| `preflight` | `start` and `resume` (slice 4) | step, status, detail |

Agent observations carry the task that asked explicitly: `ask()` gets its source from the
session it runs in, so parallel agents are never attributed by guesswork.

## View model

`src/cli/dashboard/model.ts` is a pure reducer: `RunEvent` in, dashboard state out, with the
time passed in. It holds no OpenTUI types and is the only part under unit tests. Renderables
only mirror its state.

## Slices

1. `RunEvent` channel, agent attribution, gate / command / publication events, view model.
   Clack output unchanged.
2. Read-only dashboard for `start` and `resume`, `--plain`, TTY detection. Until slice 3, a
   question suspends the dashboard and is asked through clack, then the dashboard comes back.
3. Question panels, plan review, bell.
4. Pre-flight inside the interface, agent image build output piped into the journal.
