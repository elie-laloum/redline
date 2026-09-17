# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

**Today, a single person**, who starts the run from their terminal and keeps the live shell in
one tab among others. They do not watch it continuously — they open it **when they wonder
where things stand**, and close it again.

**Confirmed direction: this becomes a team tool.** Other developers will start their own runs
and open their own shell. They will not know the vocabulary of the workflow — not the agent
names, not the step numbering, not what an "adversary" or a "memory contradiction" is. This is
not a distant evolution to be vaguely anticipated: it is a constraint that applies right now,
to every label written.

## Product Purpose

Make an autopilot run legible — a chain of thirteen steps and some fifteen agents, which can
run for three hours and cross four repositories.

The success criterion is precise and it comes from the specification: **a three-hour run
across four repositories must stay understandable in ten seconds of reading**. Ten seconds for
someone arriving cold, not for someone who was already following along.

Failure is symmetrical: a page that has to be scanned, cross-referenced or interpreted has
failed at its job, even if all the information is on it.

## Positioning

**It is a window onto a run, never a cockpit.**

A CI dashboard or an agent console tries to become the point of control. Here it is the
opposite, and deliberately so: the page **writes nothing**. Authority stays with the terminal
and the files on disk. `write-store-ticket` is the only writer of ticket state; the shell
re-reads it, it never touches it.

The consequence is accepted: **the shell is never a point of failure**. If it dies mid-run,
the run continues in the terminal. The only thing that degrades is comfort. Events are written
to disk **before** being broadcast, which makes that promise true rather than merely stated.

The one exception is `ask-user`, which deliberately blocks the workflow until it is answered —
and which falls back to the terminal when the shell stops responding.

## Operating Context

Started by the `launch-live-mode` tool when a run begins with `--live`, on a free port between
12000 and 13000, opened on its own in the default browser.

- **One shell = one run.** At the end it stays open and shows the final state; it does not
  close itself.
- **Arriving mid-run is the normal case.** On a resume, the shell replays the entire event
  history before connecting to the live stream.
- The run unfolds in three phases: scoping (steps 1 to 9, once), implementation (step 10,
  replayed for each repository by ascending `level`), capitalization and publication (11 to
  13).
- The only moment a human is required is the **gate at step 9**. Everything after it runs
  without further validation, barring an escalation.

## Capabilities and Constraints

**What the page must make legible**, per the specification: the ticket header and its Jira
status, the repositories in scope with their `level` and their state, the thirteen steps with
the current one, the agent and the tool in flight, the loop counters against their budget, the
developer's todo list live. Brought to the front as soon as they exist: an `ask-user` question
and an escalation. Collapsed by default: raw messages, event detail, the adversaries'
checklists.

**Three channels, all local.** Inbound HTTP RPC for events, outbound SSE to the browser, and a
deposit-then-collect exchange for `ask-user`. Measured: about 1.6 ms per event.

`ask-user` long held a POST open until the answer came. That does not hold: Node's HTTP client
abandons a request whose headers do not arrive within 300 s, and the batch fell back to the
terminal after five minutes when eight hours had been announced. The batch is now deposited in
one short request and the caller comes back to collect it every two seconds. **The workflow
still blocks** — that is the contract — but the blocking is held by a loop in the caller, not
by a connection. A useful side effect: a shell that restarts during the wait answers
"unknown", and the batch is deposited again instead of being lost.

**Questions are asked in batches.** `ask-user` takes a list — each question with its label,
three or four options and a free-text field always offered. A batch is only returned complete:
answering two questions out of three would restart the workflow on an assumption.

**An event that cannot be validated is logged and ignored**, never displayed half-rendered. A
truncated line costs more than its absence, because it gets believed.

**Stack in place**: TanStack Start in full SSR, React 19, Tailwind v4 with the Shadcn tokens,
Valibot for validating inbound events. Server rendering gives the complete state on the first
frame — which is what serves the cold open.

**Deliberately absent in v2**: workflow 2 (collecting and handling feedback). The fields exist
in the ticket state but are neither read nor written. `mrFeedbackCount` stays `null` and is
filled in by hand.

**Undecided, and belonging to design**: how the three needs below rank against each other on
screen.

## Brand Commitments

No visual identity is imposed. The specification asks for a **Shadcn, pared-back** style, and
nothing more.

The voice rules in `plugins/autopilot/rules/voice.md` **do not apply here**: they govern what
is published under the user's identity — Slack, Jira comments, MR threads. This interface is
internal and is signed by no one.

## Evidence on Hand

Everything the page displays really exists, and nothing has to be invented:

- `~/.autopilot/events/<ticket-id>.jsonl` — the real stream of a run, replayable
- `~/.autopilot/tickets/<ticket-id>.yaml` — the ticket state, read and never written by the
  shell
- `~/.autopilot/memory/` — the versioned knowledge base
- `pnpm fixtures` — four fixture repositories, enough to produce a demonstration run

**No performance metric, no success rate, no testimonial** exists today. The three counters on
the ticket — MR feedback, human interventions, loop turns — are the only real numbers, and the
first is `null` for as long as workflow 2 does not exist. None of this may be fabricated to
fill a screen.

## Product Principles

1. **Ten seconds, cold.** The page is opened by someone coming back after an hour. Anything
   that requires cross-referencing two places is a design failure, not a detail.

2. **Three questions, at once.** When nothing is blocked, the page must answer all at once: *is
   it moving and at what pace*, *what have the agents decided*, and *is anything drifting*.
   None of the three may cost a click or a scroll to exist. What the run **produces** — diffs,
   tests, files touched — is not part of it: that is read in the MR.

3. **It watches, it does not steer.** No button acts on the run, except answering a question
   that was asked. If the page can die without consequence, it must not give the opposite
   impression.

4. **Labels read on their own.** A colleague who has never started a run must understand
   without someone narrating over their shoulder. Internal jargon displayed raw is a debt paid
   again with every newcomer.

5. **Emptiness says something.** A silent memory, a scope not yet established, a checklist not
   yet returned: each of these states is information about progress, not a hole to paper over.

## Accessibility & Inclusion

No standard has been imposed for this internal interface.

Two needs are established by the answers: the interface must stay legible to someone who
**does not know the vocabulary of the workflow**, and it must be understandable **without
spoken commentary** — a screenshot pasted into a channel, a screen share, a new arrival on the
team.
