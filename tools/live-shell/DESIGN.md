---
name: Autopilot Live Shell
description: A run docket in ink and hairlines, where colour only ever means state.
colors:
  bg: "oklch(0.995 0 0)"
  ink: "oklch(0.16 0 0)"
  ink-soft: "oklch(0.44 0 0)"
  ink-faint: "oklch(0.62 0 0)"
  rail: "oklch(0.975 0 0)"
  rail-ink: "oklch(0.24 0 0)"
  line: "oklch(0.905 0 0)"
  line-soft: "oklch(0.945 0 0)"
  field: "oklch(1 0 0)"
  ok: "oklch(0.55 0.13 150)"
  ko: "oklch(0.55 0.2 27)"
  human: "oklch(0.52 0.18 250)"
  drift: "oklch(0.52 0.13 75)"
  primary: "oklch(0.51 0.19 277)"
  primary-surface: "oklch(0.973 0.014 277)"
  primary-line: "oklch(0.885 0.03 277)"
  primary-faint: "oklch(0.545 0.035 277)"
  select: "oklch(0.89 0.05 277)"
typography:
  duration:
    fontFamily: "ui-monospace, 'SF Mono', SFMono-Regular, Menlo, Consolas, 'Liberation Mono', monospace"
    fontSize: "12px"
    fontWeight: 500
    lineHeight: 1
    letterSpacing: "-0.01em"
    fontFeature: "tabular-nums"
  title:
    fontFamily: "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif"
    fontSize: "15px"
    fontWeight: 500
    lineHeight: 1.3
    letterSpacing: "-0.01em"
  body:
    fontFamily: "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.625
    letterSpacing: "normal"
  ui:
    fontFamily: "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.375
    letterSpacing: "normal"
  meta:
    fontFamily: "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif"
    fontSize: "12px"
    fontWeight: 400
    lineHeight: 1.4
    letterSpacing: "normal"
  legend:
    fontFamily: "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif"
    fontSize: "11px"
    fontWeight: 500
    lineHeight: 1.4
    letterSpacing: "0.025em"
  measure:
    fontFamily: "ui-monospace, 'SF Mono', SFMono-Regular, Menlo, Consolas, 'Liberation Mono', monospace"
    fontSize: "12px"
    fontWeight: 400
    lineHeight: 1.4
    letterSpacing: "normal"
    fontFeature: "tabular-nums"
rounded:
  sm: "4px"
  base: "6px"
  full: "999px"
spacing:
  hair: "2px"
  xs: "4px"
  sm: "6px"
  md: "8px"
  lg: "12px"
  xl: "16px"
  2xl: "24px"
  3xl: "32px"
  4xl: "40px"
components:
  option-row:
    backgroundColor: "transparent"
    textColor: "{colors.ink-soft}"
    typography: "{typography.body}"
    rounded: "0"
    padding: "10px 10px"
  option-row-selected:
    backgroundColor: "{colors.human}"
    textColor: "{colors.bg}"
    typography: "{typography.body}"
    rounded: "0"
    padding: "10px 10px"
  button-commit:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.bg}"
    typography: "{typography.ui}"
    rounded: "{rounded.sm}"
    padding: "0 12px"
    height: "32px"
  button-commit-disabled:
    backgroundColor: "{colors.field}"
    textColor: "{colors.ink-faint}"
    typography: "{typography.ui}"
    rounded: "{rounded.sm}"
    padding: "0 12px"
    height: "32px"
  input-answer:
    backgroundColor: "{colors.field}"
    textColor: "{colors.ink}"
    typography: "{typography.ui}"
    rounded: "{rounded.sm}"
    padding: "0 10px"
    height: "32px"
    width: "68ch"
  rail-step:
    backgroundColor: "transparent"
    textColor: "{colors.ink-faint}"
    typography: "{typography.ui}"
    rounded: "{rounded.sm}"
    padding: "4px 4px 4px 0"
  rail-step-now:
    textColor: "{colors.ink}"
    typography: "{typography.ui}"
    rounded: "{rounded.sm}"
    padding: "4px 4px 4px 0"
  rail-agent:
    backgroundColor: "transparent"
    textColor: "{colors.ink-soft}"
    typography: "{typography.meta}"
    rounded: "0"
    padding: "2px 0 2px 20px"
  rail-agent-nested:
    backgroundColor: "transparent"
    textColor: "{colors.ink-soft}"
    typography: "{typography.meta}"
    rounded: "0"
    padding: "2px 0 2px 40px"
  rail-fold:
    backgroundColor: "transparent"
    textColor: "{colors.ink-faint}"
    typography: "{typography.legend}"
    rounded: "{rounded.sm}"
    padding: "10px 0"
  rail-step-selected:
    backgroundColor: "{colors.field}"
    textColor: "{colors.ink}"
    typography: "{typography.ui}"
    rounded: "{rounded.sm}"
    padding: "4px 4px 4px 0"
  banner:
    backgroundColor: "{colors.primary-surface}"
    textColor: "{colors.ink}"
    typography: "{typography.title}"
    rounded: "0"
    padding: "12px 24px"
  notice-escalation:
    backgroundColor: "{colors.ko}"
    textColor: "{colors.ink-soft}"
    typography: "{typography.body}"
    rounded: "0"
    padding: "16px 24px"
  notice-question:
    backgroundColor: "{colors.human}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "0"
    padding: "20px 24px"
  widget:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    typography: "{typography.title}"
    rounded: "0"
    padding: "16px 24px"
  source-row:
    backgroundColor: "transparent"
    textColor: "{colors.ink-soft}"
    typography: "{typography.ui}"
    rounded: "0"
    padding: "10px 24px"
  source-row-hover:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    typography: "{typography.ui}"
    rounded: "0"
    padding: "10px 24px"
  source-summary:
    backgroundColor: "transparent"
    textColor: "{colors.ink-faint}"
    typography: "{typography.meta}"
    rounded: "0"
    padding: "0"
  maquette-frame:
    backgroundColor: "{colors.field}"
    textColor: "{colors.ink-faint}"
    rounded: "0"
    padding: "8px"
  grid-cell:
    backgroundColor: "transparent"
    textColor: "{colors.ink-faint}"
    rounded: "2px"
    size: "16px"
  grid-cell-done:
    backgroundColor: "{colors.ok}"
    textColor: "{colors.bg}"
    rounded: "2px"
    size: "16px"
  grid-cell-failed:
    backgroundColor: "{colors.ko}"
    textColor: "{colors.bg}"
    rounded: "2px"
    size: "16px"
  dock-bar:
    backgroundColor: "{colors.rail}"
    textColor: "{colors.ink-faint}"
    typography: "{typography.ui}"
    rounded: "0"
    padding: "0 24px"
    height: "44px"
  dock-bar-open:
    backgroundColor: "{colors.rail}"
    textColor: "{colors.ink}"
    typography: "{typography.ui}"
    rounded: "0"
    padding: "0 24px"
    height: "75vh"
---

# Design System: Autopilot Live Shell

## Overview

**Creative North Star: "The Case File"**

This is a dossier, not a dashboard. The page exists so that someone who opens a
cold tab after an hour can read what the agents decided and on what evidence,
and the build carries that literally: running prose in a bounded column, findings
cited as `file:line`, hairline rules between entries, and not a single card. The
metric-tile grid that this whole software category ships was refused, and the
refusal is visible in the absence of any container with a background, a border
radius above 4px, or a shadow.

The surface is built from two materials meeting on a vertical seam, under a
banner that spans the working column and over a bar pinned to the floor. On the
left, a dense rail on its own slightly-shifted ground, 304px wide, sticky:
thirteen unnumbered steps read as an index, the dossier folded beneath them, and
under the step that is live, the agents that have taken the floor — nested, one
indent per level of invocation. On the right, the workbench, full width, where
what the run is fabricating stacks and disappears again. Along the bottom, a
44px bar that opens onto three quarters of the screen and holds the raw event
log. The build is recognisable with the text blurred out, which was the point.

**One thing runs at a time, and the page shows which.** The workflow has no
parallelism, so the surface refuses to imply any: there is exactly one spinner on
screen, and it sits on whatever is acting — a step while it works, its agent once
it hands off, that agent's own child one indent deeper. The line that handed the
floor over does not go dark; it breathes. Depth of work is read as depth in the
list, which is the single idea the rail is built on.

The palette is greyscale ink at four weights, four state hues, and one ground
indigo. The four state hues say what passed, what broke, what is waiting on you
and what is going wide — and they say nothing else. The indigo is not a fifth
state: it is a ground, held to two jobs, the banner's floor and what is selected,
at a tenth of the chroma of the dots that sit on it. Where the two would compete,
the floor loses its tint, never the dot. Emphasis is carried by ink weight and
type size. Light and dark are both shipped and the system picks, because this tab
lives next to a terminal.

**Key Characteristics:**
- Hairlines and whitespace only; zero cards, zero shadows, zero elevation.
- Colour is a state channel; the one ground tint is confined to two jobs.
- "Now" is marked by full-weight ink against muted surroundings, never by a hue.
- A dense rail on its own ground against a full-width workbench.
- Monospace is reserved for what is measured or located; everything else is sans.
- One progress scale, six states, one dot — steps and agents read identically.
- Exactly one spinner on screen; the line that handed off breathes instead.
- Two registers: what the run produces never folds, what it ingested folds shut.
- The widget order is the run read backwards, computed from a declared step.
- One raster in the whole system — the captured mock-up, framed as evidence.

## Colors

Greyscale ink on near-white or near-black ground, with four chromatic tokens
that are only ever allowed to report state, and one ground tint that is allowed
two jobs and no others.

### Primary

**Ground Indigo** (`colors.primary`) never appears at full strength. It ships as
two derived grounds — `primary-surface`, the banner's floor, and `primary-line`,
the rule under it — plus the selection wash, and it does exactly one thing there:
it detaches the banner from the widgets below, so the state you read first is not made
of the same material as the text beneath it.

It is deliberately not the way anything is marked. The role a brand accent
normally plays — marking the live, the current, the important — is played by
**Full Ink** (`colors.ink`) at full weight while everything around it drops to
soft or faint. The current step's row, an evidence path, an arbitration question:
all of them are just ink at full strength.

The containment is numeric, not a matter of taste. `primary-surface` sits at
0.014 chroma; the `human` dot that lands on top of it sits at 0.18 — an order of
magnitude apart. If they ever read as competing, the floor gives up its tint. A
ground that starts meaning something is a fifth state colour nobody declared.

The one token derived for legibility rather than for ground is **Faint Indigo**
(`colors.primary-faint`): the banner's secondary text. Grey at `ink-faint`
measured 3.4:1 against the tinted floor, so the secondary tier is tinted from the
floor's own hue and darkened until it clears 4.5:1 in both schemes. Secondary
text on a tinted surface is tinted from that surface, never left grey.

### Secondary

The four state hues. They are secondary only in the sense that they are never
the field's subject; they are load-bearing where they appear.

- **Verdict Green** (`colors.ok`): something is rendered, and nothing else. A
  finished run, a step the workflow has gone past, an agent that handed back a
  result, a passing checklist line, a repo confirmed in scope. It once carried a
  second reading — "alive" on a sub-agent row — and that cost the page its most
  useful distinction, because green then meant both "still going" and "done" two
  lines apart. What is alive is now the spinner's job, which no colour shares.
- **Halt Red** (`colors.ko`): something broke or stopped. The escalation notice's
  rule and 6% wash, a spent loop budget, a dropped event stream.
- **Human Blue** (`colors.human`): the run is stopped on you, and nothing moves
  until you answer. The question batch's rule and wash, the dot that replaces the
  spinner, the banner's lead word, and — inside that region only — the option you
  have chosen and the dots of the batch's own track. It is the only hue that
  names an action you owe, which is why it is not shared with drift.
- **Drift Amber** (`colors.drift`): something is going wide while the run still
  moves. A loop one turn from its budget, an unresolved memory contradiction, an
  agent silent for five minutes, events the shell could not parse, and the count
  a collapsed rail section shows so that folding it away never hides a signal. It
  asks you to look, not to answer. It sits at 0.52 lightness rather than a
  brighter amber because it is read at 12px on three different grounds.

### Neutral

- **Paper** (`colors.bg`): the page ground. Near-white in light (0.995 L), a deep
  neutral charcoal in dark (0.175 L) — never pure black.
- **Full Ink** (`colors.ink`): primary text, the current step, evidence paths, the
  focus ring, the commit button's fill, selected chips.
- **Soft Ink** (`colors.ink-soft`): the default weight for running prose, answers,
  completed steps, list labels. Most of the page's words are this.
- **Faint Ink** (`colors.ink-faint`): metadata that must be present but not read
  first — timestamps, counts, legends, placeholder text, empty-state sentences,
  the word `agent` that prefixes every agent name. At 50% opacity it is also the
  fill of the handed-off dot and the stroke of the not-started ring, which is why
  those two read as the same material at two strengths rather than as two states
  of unrelated origin.
- **Rail Ground** (`colors.rail`) and **Rail Ink** (`colors.rail-ink`): the rail's
  own surface, a hair off the page ground in light and a hair darker in dark. This
  one-step tonal shift is the entire reason the rail reads as a distinct object.
- **Rule** (`colors.line`) and **Soft Rule** (`colors.line-soft`): the two hairline
  weights. `line` separates regions (rail seam, header, section headers); `line-soft`
  separates repeating rows inside a list. In dark they are white at 13% and 7%.
- **Field** (`colors.field`): the only fill in the system — inputs, unselected
  chips, hovered and selected rail rows. It is one step off the ground, not a card.
- **Selection** (`colors.select`): the browser text-selection wash, themed rather
  than left at the UA default.

### Named Rules

**The Selection-From-The-Surface Rule.** Inside a state region, what is selected
is drawn from that region's own hue at full strength, never from ink. The
question batch sits on a `human` wash, so the chosen option is `human` — the
selection belongs to the same family as the thing it is inside. Filling it with
ink imported the commit button's colour into a place where nothing is committed,
and put the heaviest block on screen on something still being decided.

**The State-Only Colour Rule.** Green, red, blue and amber may appear only where
they report the status of something the run produced. No chromatic token may be
used for emphasis, branding, hierarchy, decoration, or to distinguish one section
from another. Audit test: for every coloured pixel on screen, name the thing whose
state it reports. If you cannot, delete the colour.

**The One-Scale Rule.** A step and an agent are drawn from the same six-state
scale and the same atom — not-started, running, handed-off, waiting on you,
failed, rendered — so a reader learns the vocabulary once and applies it at every
depth. The rail and the banner previously spoke two dialects of it, with green
meaning "alive" in one and "done" in the other; recoupling two dialects twenty
pixels apart is precisely the cost this page exists to remove. A state that
cannot be expressed in the shared scale does not get a private colour; it gets a
word.

**The Motion-Means-Acting Rule.** Aliveness is reported by motion, never by hue.
The spinner marks what is acting; the slow fade marks what has handed off and is
still open; a static dot marks everything else. Colour is then free to report
outcome alone, which is the only way one palette can serve both questions.

**The Ink-Weight Now Rule.** "Now" is full-weight ink against soft and faint ink.
Done is soft, not-yet is faint, current is full and medium-weight. The banner's
indigo floor is not an exception: it separates a region, it does not say which
step is current. Marking the current step with a hue instead of ink weight is a
regression — it was scored as one in the finish review and reverted. The state
dot beside a row is not an exception either: it reports that row's outcome, while
ink weight reports where the reader is. The two answer different questions and a
step can be green and current at once.

**The One-Step Ground Rule.** A surface distinguishes itself from the page by one
tonal step (`rail`, `field`) and a hairline. Never by a shadow, never by a radius
above 4px, never by a border heavier than 1px.

## Typography

**Display Font:** none. The system ships no display role; the largest type on the
page is 15px.
**Body Font:** the platform UI sans stack (`ui-sans-serif, system-ui, -apple-system,
'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif`), with the `cv02 cv03 cv04 cv11`
feature set on so digits and letterforms stay unambiguous.
**Label/Mono Font:** the platform monospace stack (`ui-monospace, 'SF Mono',
SFMono-Regular, Menlo, Consolas, 'Liberation Mono', monospace`).

**Character:** deliberately unstyled and dense, the register of a terminal's
sibling tab rather than a product page. The ramp is deliberately narrow — 11px to
15px, five steps — so nothing on the page can shout. What needs to stand out buys
it with weight, position and ink weight, which is the only currency a ramp this
tight leaves.

### Hierarchy

- **Duration** (mono, 500, 12px, `line-height: 1`, tight tracking): the current
  step's elapsed time, parked at the right of the banner's first level. It is the
  only signal of temporal drift the system has, and it is set apart by weight and
  by position rather than by size.
- **Title** (500, 15px, tight tracking): widget headings, the escalation
  headline, the question-batch headline. The largest type on the page — nothing
  is larger, and no display face exists.
- **Body** (400, 14px, `line-height: 1.625`): running prose — the Now line,
  arbitration questions and answers, scope reasons, escalation explanation.
- **UI** (400, 13px, `line-height: 1.375`): the working default for rows,
  buttons, inputs, chips, rail steps, checklist lines.
- **Meta** (400, 12px): counts, agent names, statuses, secondary explanation.
- **Legend** (500, 11px, `letter-spacing: 0.025em`, uppercase): section legends
  above a list — "Le dossier", "À surveiller", "Dépôts concernés", "Todo du
  developer", "Vérifications". These label a list they sit directly on top of;
  they are never a kicker above a heading.
- **Measure** (mono, 12px, tabular): anything measured or located — `file:line`
  evidence, repo names, step ids, counters, ratios, clock times.

### Named Rules

**The Mono-Means-Measured Rule.** Monospace is used only for what is measured or
located: paths, line ranges, durations, timestamps, counters, ticket keys. It is
never worn as a technical costume over prose — agent names are sans, because an
agent is a who and not a measurement.

**The Named-Kind Rule.** A proper noun the reader has no way to classify is
prefixed with its kind in faint ink: `agent - developer`, never `developer` bare.
Set beside thirteen step labels written in French prose, an English hyphenated
identifier reads as a fourteenth step. One muted word settles what it is, and it
costs less than teaching the vocabulary.

**The Tabular Column Rule.** Every number that changes in place is tabular
(`font-variant-numeric: tabular-nums`, applied globally to `time` and `.tabular`).
A counter that changes width when it changes value makes the line jump, and the
reader believes something moved.

**The Uncut Sentence Rule.** Agent-written text is shown whole, or bounded
somewhere the whole is still reachable — never quietly cut. A truncated title is
more expensive than an absent one, because it is believed, so the banner's
second level shows the bounded title and then the detail beneath it,
`whitespace-pre-wrap`.

That detail is clamped to three lines with an ellipsis, and the clamp is not a
nicety. The banner is sticky and first in the column, so every pixel it takes it
takes from the workbench below: a plan's detail measured 951px on a desktop and
2789px on a phone — three screens of header — and the approval module it
announced was pushed out of sight. A banner that hides the button it is
advertising is worse than a silent one. The cut is permitted because the drawer
along the floor carries every event's detail in full, on the same screen.

Three kinds never reach the banner at all — an answered batch, a submitted plan,
a verdict. Each already has a full-width module directly beneath rendering it
whole, and a header that repeats what is legible under it removes the one thing
only it could say.

## Layout

Two columns meeting on a vertical hairline. The rail is a sticky, full-height
`aside` of fixed 304px (19rem) on its own ground, with a right border; the main
column takes the rest and is internally padded 24px.

The rail is 2.75rem short of the viewport (`calc(100vh - 2.75rem)`) and the page
carries the same amount as bottom padding, because a bar is pinned to the floor
and neither column may end underneath it.

The main column is **one stack of widgets**, all of them full width and padded
24px, separated by hairlines: what is being fabricated, what is still blocking,
the exit contract, then what has been decided. A widget with nothing to say is
not rendered at all.

It held two registers before, and the second one replaced the first: clicking a
docket entry in the rail swapped the workbench for a document column, so the
worksite and the review left the screen while you read one decision, and you
went back to find out where the run was. One content, one view. The rail now
scrolls to a widget and opens it on the right entry; nothing disappears.

Inside a widget, prose still keeps the measure — a question, an answer, a
criterion are capped at 68ch — while the controls, grids and rows around it take
the full column.

The banner is sticky at the top of the main column on a 95%-opacity indigo floor
with a backdrop blur, so text scrolling under it stays legible. It holds two
levels: the shell's own vocabulary on the first — state mark, step label, agent
and tool, elapsed — and the agent's sentence on the second, indented to the step
label's left edge.

Under the step list, the rail carries **the dossier**: one disclosure per section
that the run has produced, listing its entries by name. The repos live here too,
open by default — they were once a second list at the foot of the rail, saying
the same thing in another shape. The foot now carries a single disclosure, what
to watch, pushed down by the rest.

The raw event log left the main column entirely. It lives in a **bar pinned to
the bottom of the viewport**, 44px tall, spanning both columns, which opens to
75vh over the page rather than pushing it.

**Breakpoints** (Tailwind defaults, two of them used): `md` 768px reveals the
banner's agent/tool attribution; `lg` 1024px is the real one — below it the rail
is removed entirely and replaced by a compact strip on the rail's own ground
under the banner, with the dossier reappearing in full at the end of the column.

**Rhythm**: a 2/4/6/8/12/16/24/32/40px scale. One level of nesting in the rail is
20px of indent, applied once per level. Rows inside a list are 4–6px apart,
related blocks 8–12px, sections inside the rail 24px, widgets 16px above and
below their own hairline. Section headers sit on a hairline with 8px of breathing room below the text.

### Named Rules

**The No-State-Loss Rule.** The page's first job is to say where the run is. Step,
state and duration are carried by the banner at every width, so they never depend
on the rail existing. What the rail alone carries — scope, loop budgets, drift —
must reappear in another form when a breakpoint removes it. Losing state at 390px
is not an acceptable responsive outcome, and neither is saying the same thing
twice at 1440px.

**The Margin-Not-Gap Rule.** Prose is bounded at the readable measure (68ch) and
the remainder is treated as a document margin. Do not widen text to fill it and
do not drop a card into it; put a timestamp there, or nothing. The rule is about
prose and only prose: grids, rows and counts take the full column, and bounding
those at a reading measure leaves a column of dead space beside a widget that had
room to breathe.

**The One-Content-One-View Rule.** No content is rendered twice on this page.
A widget is the only place its subject exists, and every other mention of it —
a rail entry, a count, a fold — is a way to get there, never a second copy. Two
renderings of the same list are two things to keep in step, and the one you are
not looking at is the one that goes stale.

**The Reserved-Floor Rule.** Anything pinned to the viewport reserves its own
height from both columns — the page's bottom padding and the rail's height are
computed from the bar's 44px. A fixed element that covers the last row costs
exactly the row the reader came for, and it costs it silently.

## Elevation & Depth

There are no shadows anywhere in this build, and none are permitted. Depth is
conveyed by exactly three devices: a one-step tonal shift (the rail's ground, the
field fill), a 1px hairline in one of two weights, and a translucent sticky
header with a backdrop blur. Two state regions — escalation and the question
batch — are washed with their state hue at 6% opacity and bounded by that hue at
40%; that wash is the closest thing to a surface in the system, and it is still
edge-to-edge with square corners.

### Named Rules

**The One-Spinner Rule.** There is exactly one spinner on screen, on the deepest
thing that is acting, and the rail's derivation guarantees it rather than hoping
for it: a line that has handed the floor to another cannot be `running`. Two
rings turning twenty pixels apart for one living thing claims a parallelism this
workflow does not have.

**The Breath-Not-Pulse Rule.** A line that has handed off breathes: opacity 1 to
0.08 and back over 2.4s, `ease-in-out`, no scale and no colour change. It travels
between its own two neighbouring states — the muted dot it is, and the empty ring
of what has not started — so the motion reads as "open, not mine" rather than as
a heartbeat. It must stay under the spinner's threshold: the spinner is the
subject, the breath is the context. A third continuous motion needs a state
nothing else reports; the drawer's height transition is not one, because it runs
once on a gesture and then stops.

**The Folded-Signal Rule.** A section may be collapsed only if collapsing it
cannot hide a problem. A fold that carries a signal shows its count, in the
signal's hue, on its own header. If a signal cannot be summarised into the
header, the section does not get to fold.

**The Two-Registers Rule.** What the run produces never folds; what the run
ingested folds, and is closed by default. The distinction is movement, not
importance: a review folded is a review nobody reopens, and reopening it is the
entire reason it exists, whereas a ticket statement is fixed the moment it is
read and is consulted when an arbitration surprises — not every ten minutes. A
produced module that has nothing to say disappears instead of collapsing. An
ingested one stays, closed, carrying its summary, because its absence and its
emptiness are different facts.

**The Flat-Forever Rule.** No `box-shadow`, no `drop-shadow`, no simulated
lift, at rest or on any state. A surface that needs to separate from its
neighbour gets a hairline or a tonal step, and if neither reads, it is in the
wrong place in the layout.

## Shapes

Square by default. Regions — the rail, the header, the state strip, the
escalation notice, the question batch, the event drawer — have no radius at all; they
run edge to edge and are bounded by rules — the bottom bar included, at both its
heights. Radius appears only on things that are touched or picked: option chips,
inputs, buttons, rail step rows and the focus ring, all at 4px (`rounded.sm`,
derived from a 6px base token). The only full rounds in the system are the dots —
the progress dot at 10px, carried identically by the banner, the thirteen steps
and every agent row, and the status dot at 6px for a repo, a todo or a check —
plus the spinner (12px) and the scrollbar thumb. Every dot is centred in a 12px
box, the spinner included, so that a change of state never shifts the line it
sits on.

Not-started is the one dot drawn as a ring rather than a disc: a 1px stroke of
faint ink at 40%, no fill. It keeps the diameter of every other state, so the
thirteen steps read as one column of dots at two densities rather than as two
unrelated marks.

Borders are always 1px, always one of the two rule tokens, and are set globally
so that any bordered element inherits the correct colour in both schemes. The
spinner is the one exception at 1.5px, because a hairline ring at 12px would
disappear.

**Imagery is evidence or it is absent.** The system ships exactly one kind of
image — the captured Figma frame — and it is there because the run's visual
arbitrations cannot be checked against a text outline. There is no illustration,
no icon set beyond the drawn atoms, no photograph, no decorative graphic, and no
placeholder standing in for content that has not arrived. An image is framed
like any other region: a 1px rule on the field ground, square, no shadow, height
capped so it cannot push the rest of the run off the screen. Whatever palette
the image carries is its own and is exempt from the state-colour rule — it is a
quotation from another tool, not a surface of this one, and the frame is what
marks the boundary.

## Components

### Buttons

- **Shape:** slightly softened corners (4px), 32px tall.
- **Commit (`button-commit`):** full ink fill, page ground for text, medium
  weight, 12px horizontal padding. Used once per surface, for the action that
  restarts the run.
- **Hover / Focus:** hover drops opacity to 90%; focus is the global ring (2px
  solid ink, 2px offset). No transform, no shadow.
- **Disabled (`button-commit-disabled`):** field fill with faint ink and
  `not-allowed`; the button stays in place rather than disappearing, so the
  reader sees what remains to be answered.
- **Ghost rows:** the rail step, the drift row and the drawer's handle are
  unstyled buttons that only announce themselves on hover — field fill and ink
  text for the rail row, ink text for the handle.

### Option Rows

- **Style:** one option per row, the full width of the column, separated by
  hairlines of the module's own hue, square, 14px, 10px of padding, with a drawn
  ring at the left. They were chips in a wrapping row, which reads as a mosaic;
  four answers written to be chosen as they stand are short prose, and short
  prose is read down a column.
- **State:** selected fills with **Human Blue** at full strength, page-ground
  text, and the ring fills in the same ground colour. Unselected hover washes the
  row with the same hue at 10% and lifts the text to full ink. Typing in the free
  field below deselects the row, because the written answer is the more explicit
  gesture of the two.

### Cards / Containers

There are none, and this is a rule rather than an omission. Content is grouped by
a section heading on a hairline, by vertical spacing, and by row separators
(`line-soft`, with `last:border-b-0`). Nothing is put in a box.

### Inputs / Fields

- **Style:** 32px tall, field fill, 1px rule border, 4px radius, 13px text,
  10px horizontal padding, capped at 68ch. Placeholder in faint ink.
- **Focus:** the global focus ring — 2px solid ink at 2px offset. The caret is
  themed to ink rather than left at the UA default.
- **Legend:** each field's header is an 11–12px uppercase legend that turns
  Verdict Green once the field carries an answer, so completeness is readable
  without counting.

### Navigation

The rail is the navigation. Thirteen step rows at 13px, unnumbered: the list is
an `<ol>`, so position is still announced to anyone listening, and thirteen labels
that read on their own beat thirteen labels behind a counter that has to be
translated. Done rows are soft ink, upcoming rows faint, the current row full ink
and medium weight. Every row carries the progress dot, and the dot answers a
different question from the ink: the dot is that step's outcome, the ink weight
is where the reader is. Rows whose step produced something are buttons: clicking
one scrolls to that step's widget and opens it on the right entry, and marks the
row with a field fill. It no longer swaps the column — the widget is the only
place that content exists, so there is nowhere to swap to.

**The nested levels.** Under a step that opened agents, each level of invocation
is one 20px indent — the step, the agent it invoked, and the agents that agent
invoked in turn. Only the implementation cycle goes three deep: the orchestrator
routes, and the six agents of the cycle live beneath it. Putting them side by side
said they relieved each other as peers, when one holds the counters while the
others pass through. Depth is carried by indent alone — no rule, no bullet: the
rail is already a list, and a second list marker per level would weigh more than
what it organises.

Every agent name is prefixed `agent - ` in faint ink, and every agent row carries
the same progress dot as the step above it. An agent's state comes from its last
event in the step whatever its kind, with one correction that is the whole model:
`ok` closes an action, not an agent, so whoever spoke last keeps the spinner
until someone else speaks. Its parent is not `done` while it works — it is
handed-off, and it breathes.

The live step is expanded; a past step folds behind a caret, with its agent count
shown only from two upward.

Below `lg` the rail is replaced by a compact strip on the same ground: one
horizontal band under the banner carrying scope dots, loop budgets and drift
counts — and nothing the banner already says. The dossier reappears in full at
the end of the column, because losing the decisions at 390px would be an
amputation rather than a responsive trade.

### The Widgets (signature component)

The stack that replaced the docket column, and the reason the surface exists.
Each is a 15px heading on a hairline with its count in monospace, then its
content, and nothing else: no card, no fill, no radius. What separates two
widgets is the hairline of the next.

**The order is the run, read backwards, and it is computed rather than typed.**
Every widget declares the workflow point that produced it, and the stack sorts
on that number, descending: the newest thing the run made is the first thing
read. Two places are pinned ahead of the sort — the approved plan, then the
review — because those are the two blocks the reader comes back for during the
three hours of the cycle. The rest follow in reverse production order: the
memory write, the contradicted notes, the worksites, the technical
arbitrations, the targeted memory pass, the repos, the functional
arbitrations, the broad memory pass, the mock-up, the ticket. Where several
worksites are open they sit together at their shared point, most recently
opened first; the sort is stable, so the sequence within a point is the
sequence the array declares.

**The order never changes with the step**, because the number belongs to the
kind of widget and not to the state of the run. What moves is only which
widgets exist, never where they sit. An order that moved would make the reader
hunt, on every visit, for where the thing they came to read went — and a hand-
typed order decays into the sequence the file happened to be edited in, which
is why the rule is the sort and not a list.

No section cites a step number: the rail stopped numbering, and a back-reference
that makes you count rows is the recoupling the page exists to remove.

**Two ways of reading a list, and one question decides which: does the item carry
a state?**

- It does — a checklist line is rendered or it is not. Completion is then what
  you came for, and a **grid of 16px squares** says it without counting: filled
  for rendered, hollow for not, red for blocking. Twenty-eight squares are read
  at a glance; twenty-eight rows are read twenty-eight times. The square is
  deliberately not a dot: the dot is already the alphabet of states in the rail,
  and a row of twenty-eight of them would read as twenty-eight agents.
- It does not — an arbitration is a question, an answer and the reason that binds
  them. There is nothing to see at a glance, so the **carousel is the overview**,
  not a detail: one item, arrows, and a strip of position dots below. Under two
  items neither applies; a carousel of one is a mechanism for nothing.

Where both appear, they compose: the grid is the overview and the carousel
carries the open line, and its dots take the state colours so the strip repeats
the grid one size down. The arrows run across both grids of a checklist without
the reader having to know they changed list.

The **why** of an arbitration is rendered whole and never truncated. It is the
only part still worth anything six weeks later, when the answer has become code
and nobody remembers what was ruled out.

Evidence lines are split at the em dash — the `file:line` half set in monospace
full ink because it is a location, the explanation half in faint prose.

Empty states are written, never hidden: "retained without a written reason —
check before approving the plan", "no located evidence — the scope-scout cited
nothing". An absence is information about how far the run has got.

### The Source Register (signature component)

The second register of the workbench, and the only one that folds. A widget
shows what the run **produced**; a source shows what it **ingested** — the
ticket's statement, the mock-up, what memory already knew on each of the two
scout passes, and what the run wrote back to memory. Four kinds, sitting at
their own points in the same sort as everything else.

**Closed, a source is one 13px row** at half the vertical padding of a widget
(10px against 16px): the caret, the title in medium weight, a one-line summary
in faint ink that truncates, and an optional monospace measure or timestamp
pushed right. Open, it drops its content below at the widget's own rhythm. The
row is the same object the approved plan has always been — one disclosure
pattern, one caret atom, used at every depth including the mock-up's own
component outline.

**The summary is the whole justification for the fold.** "Mock-up" is an
invitation to click; "Mock-up — LAB pondération altair, popup opened" answers
without one. Where the summary reports something worth looking at rather than
something merely counted, it takes drift amber and nothing else changes: "3
files read · nothing on the subject", "1 referenced, no image".

**A source states a fact, never a cause it cannot know.** An absent field and
an empty one are indistinguishable from the page, so a source renders only on
positive ingested material and phrases its gaps as observations. The ticket
source does not appear on a key and a URL alone — those exist before the run
has read anything, and a widget built on them would announce "no acceptance
criteria" about a run that simply had not written them yet.

#### The Mock-Up Frame

The one raster in a page built entirely of ink and hairlines, and it earns the
exception because a component outline names the parts while only the image
settles what was actually agreed. It sits in a 1px `line` frame on the field
ground with 8px of padding, capped at 60vh and centred, the PNG scaled to fit
inside. No radius, no shadow, no lightbox: full size is reached through the
Figma link, because the page does not become a second viewer of something it
does not own. Beneath it, a caption row carries the frame name in soft ink, the
node id in monospace, and the outbound link pushed right; the component outline
folds below that, closed.

The pixels are served from `~/.autopilot`, never from Figma. A render URL
expires within the hour and the file link wants a token the browser does not
have, so a run reopened three weeks later would frame an empty box around the
thing its arbitrations were decided on.

### The Banner

The first thing read on a cold tab, and the only thing that survives a screenshot
pasted into a channel. Sticky, full-bleed across the main column, on the indigo
floor with a `primary-line` rule under it and a backdrop blur.

- **First level** — the shell's vocabulary, whose shape never changes: the run
  mark, one of the thirteen step labels (never agent-written, therefore always
  legible), the agent and tool in faint indigo mono above `md`, and the step's
  elapsed time pushed right.
- **Second level** — the agent's vocabulary, indented to the step label's left
  edge: the ticket key, then the event's sentence, rendered whole. When the run
  is stopped the key gives way to the state word — "Le run t'attend", "Le run est
  arrêté", "Le run est terminé" — in that state's hue.
- **Aside** — appears only when there is something to say: an agent silent past
  five minutes, in drift amber, and a dropped SSE stream in halt red. The stream
  is reported apart from the run's own state, because a dead shell is not a dead
  run.

### The Rail Folds

Two blocks of disclosures, all sharing one atom: legend type, a caret, a soft
hairline between siblings, the open state remembered per viewer, and a section
with nothing in it not rendered at all. A collapsed section that carries a signal
shows its count in drift amber on its own header — that is what makes folding
safe, and therefore what makes it usable.

**The dossier**, under the step list: one fold per section the run has produced,
each listing its entries by name with its count on the header. Folded by default,
because it is navigation and not state. **Dépôts concernés** is the exception and
is open, carrying each repo's status dot, name and level; it earned the exception
by absorbing a second list that used to sit at the foot of the rail saying the
same thing in another shape, and each row now also takes the reader to why that
repo was retained.

**What to watch**, at the foot, pushed down by everything above: loop counters
against their budgets, and contradicted memory notes. It is the only fold left
down there.

### The Event Drawer

A bar pinned to the bottom of the viewport across both columns, 44px tall on the
rail's ground at 95% with a backdrop blur and a hairline on top. It is the whole
raw event log, and it used to sit at the foot of the main column behind a
disclosure — which meant scrolling the entire page to reach it and losing sight
of the banner on the way. It is exactly the material one consults *while keeping
an eye on the rest*.

Closed, it is not mute: it carries its own label, the event count in tabular
monospace, and the count of unparseable events in drift amber. A bar that says
nothing until it is opened gives no reason to open it.

Open, it animates to 75vh (`transition: height 300ms ease-out`, dropped under
`prefers-reduced-motion`) and **covers rather than pushes** — the page below does
not reflow, so nothing the reader was looking at moves. `Escape` closes it: a
drawer at three quarters of the screen that can only be dismissed by hitting a
28px target is a drawer opened once. The log itself mounts only while open;
three hundred rows rendered permanently under a 44px bar are three hundred rows
nobody is reading.

It is consultation, not control. Nothing in it acts on the run.

### State Notices

Escalation and the pending question batch are full-bleed regions, square, bounded
top and bottom by their state hue at 40% over a 6% wash of the same hue. They sit
directly under the Now header, above the widgets, so they take the top of the
fold without a modal, an overlay, or a scroll lock.

### Atoms

- **Spinner:** a 12px ring, 1.5px, faint at 30% with a full-ink top arc, rotating
  once every 1.1s, linear, infinite. One of the page's two continuous motions.
  Under `prefers-reduced-motion: reduce` the animation stops and opacity is held
  at 1 — frozen, never hidden, because the ring is still the marker for "here".
- **Progress dot:** the page's one state atom, used unchanged by the banner, the
  thirteen steps and every agent row. Six states in one 12px footprint: the
  spinner for `running`, and otherwise a 10px disc — faint at 50% handed-off,
  `human` waiting on you, `ko` failed, `ok` rendered — or a 1px faint ring at 40%
  for not-started. It takes an optional breath for a line that has handed the
  floor down, and a label so the state is spoken as "Implémentation : a passé la
  main" rather than as a lone adjective. The precedence is part of the rule: a run
  that escalated while a question was still open shows stopped, not waiting.
- **Status dot:** 6px, full round, `ok` / `ko` / `human` / `drift` / full ink for running
  / faint at 50% for pending. Always paired with the status word; the dot alone is
  never the only carrier of meaning.
- **Caret:** one 12px inline SVG at 1.5px, rotated 90° when open, used by every
  disclosure on the page — the rail's folds, a past step's agents, the bottom
  drawer, where it is pre-rotated so that closed points up and open points down.
  One drawing, one stroke weight, one rotation centre.
- **Document glyph:** a 16px inline SVG at 1.3px — a folded corner and three
  lines of unequal length, because it opens a log and not a form. It is the
  drawer's handle, and it is drawn rather than borrowed from an icon font, at the
  stroke weight of the caret so the two look made together.
- **Elapsed / At:** `<time>` elements in tabular monospace, formatted `45s`,
  `12m`, `2h 07`. All of them read one clock, mounted client-side so the server's
  time never shows through on the first frame.

## Do's and Don'ts

### Do:

- **Do** spend colour only on state. `ok`, `ko`, `human` and `drift` report what
  passed, what broke, what is waiting on you and what is going wide, and nothing
  else. The indigo ground is the one exception, and it is confined to the banner
  floor and the selection wash.
- **Do** mark the present with full-weight ink against soft and faint ink.
- **Do** separate surfaces with a 1px hairline (`line` between regions,
  `line-soft` between repeating rows) or a single tonal step.
- **Do** keep running text inside the measure (68ch) and treat the remainder as a
  margin. Everything that is not prose — grids, rows, controls, counts — takes
  the full column.
- **Do** put a subject in exactly one widget, and make every other mention of it
  a route to that widget.
- **Do** set monospace on anything measured or located, and make every changing
  number tabular.
- **Do** theme the browser's own surfaces from the palette: selection, caret,
  focus ring, scrollbar thumb and track, underline offset.
- **Do** write empty states as sentences that say where the run is.
- **Do** restate the rail's state in another form whenever a breakpoint removes
  the rail.
- **Do** let `prefers-reduced-motion` freeze the spinner and the breath while
  keeping them visible, and drop the drawer's height transition entirely.
- **Do** draw a step and an agent from the same six-state scale and the same
  atom, at every depth of nesting.
- **Do** prefix a bare identifier with its kind in faint ink when the reader has
  no way to classify it — `agent - developer`.
- **Do** reserve the height of anything pinned to the viewport from every column
  it crosses.
- **Do** give every dot the same 12px footprint whatever its state, so changing
  state never moves the line it sits on.
- **Do** tint secondary text on a tinted surface from that surface's own hue, and
  darken it until it clears 4.5:1 — measure it, don't eyeball it.
- **Do** hide a rail section that has nothing in it, and surface its signal on the
  header when it is folded.
- **Do** derive the widget order from the workflow point each widget declares,
  sorted newest-first, with only the approved plan and the review pinned ahead
  of it.
- **Do** give a folded row a summary that answers the question the reader
  opened it with, and let that summary carry drift amber when it reports
  something to look at.
- **Do** state what is missing without asserting why, when the page cannot tell
  an unwritten field from an empty one.
- **Do** give a wrapping two-part row a floor on its prose column (24ch) so it
  drops to its own line instead of stacking one word wide on a phone.

### Don't:

- **Don't** let the ground indigo leave its two jobs — the banner floor and the
  selection wash — or rise in chroma to where it reads as a state. No other
  decorative hue, brand colour, or section-identity tint may join it.
- **Don't** mark the current step, or anything else, with colour instead of ink
  weight. This regression has already been shipped once and reverted.
- **Don't** put content in a card, a panel, or any box with a fill, a radius
  above 4px, and a border at once.
- **Don't** add a shadow of any kind, at rest or on hover.
- **Don't** build a metric-tile grid. Numbers live inline against their label, in
  monospace, at the size of their neighbours. The checklist grid is not one: its
  squares carry no number and each one is a line you can open.
- **Don't** render the same content in two places. One widget owns a subject;
  everything else routes to it.
- **Don't** round a region. Radius belongs to things that are touched or picked.
- **Don't** let type exceed 15px, or introduce a display face. A widget heading
  is the largest thing on the page; emphasis is bought with weight, position and
  ink, never with size.
- **Don't** truncate agent-written prose without showing it in full somewhere on
  the same screen. The banner's three-line clamp is allowed because the drawer
  carries the whole detail; a clamp with nowhere to read the rest is not.
- **Don't** let the banner grow with what an agent wrote. It is sticky and first
  in the column, so it spends the workbench's space: bound the detail, and say
  nothing at all when a module below already renders it whole.
- **Don't** show two spinners at once. One thing acts at a time in this workflow,
  and the derivation must guarantee it rather than the layout hoping for it.
- **Don't** report aliveness with a hue, or an outcome with motion. Colour says
  what happened; movement says what is happening. Green meaning "still working"
  cost this system its clearest distinction once already.
- **Don't** add a third continuous animation. The spinner and the handed-off
  breath are the whole budget; a transition that runs once on a gesture is not a
  third.
- **Don't** number the steps in the rail, and don't have a widget refer back to
  a step by number. The `<ol>` already carries position for anyone listening, and
  a back-reference that makes the reader count rows is the recoupling this page
  exists to remove.
- **Don't** let a fixed element cover content it did not reserve room for.
- **Don't** use a text glyph as an icon. Rotating a `›` is not a chevron: it
  carries the font's weight and turns about its text box rather than its point.
  Draw an inline SVG at the stroke weight of the page — and draw it once: there is
  one caret atom, used by every disclosure.
- **Don't** fold anything the run is still producing, and don't leave a folded
  row without a summary. A fold that says only its own title has moved a click
  in front of the reader and bought nothing.
- **Don't** type the widget order into an array. It decays into the order the
  file was edited in; the sort on the declared point is the rule.
- **Don't** infer an absence from an empty field. "No acceptance criteria" and
  "nobody wrote the acceptance criteria" are different sentences, and only one
  of them is knowable from here — a stated absence that turns out to be a
  missing write costs more than saying nothing, because it gets believed.
- **Don't** add a second reading measure. Running prose is bounded at 68ch
  wherever it appears, ingested documents included.
- **Don't** introduce imagery that is not evidence. The captured mock-up is the
  only raster the system carries; an illustration, a stock photograph or a
  placeholder box would be the first decoration on a surface that has none.
