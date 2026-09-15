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
  option-chip:
    backgroundColor: "{colors.field}"
    textColor: "{colors.ink}"
    typography: "{typography.ui}"
    rounded: "{rounded.sm}"
    padding: "4px 10px"
  option-chip-selected:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.bg}"
    typography: "{typography.ui}"
    rounded: "{rounded.sm}"
    padding: "4px 10px"
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
banner that spans the working column. On the left, a dense rail on its own
slightly-shifted ground, 304px wide, full height, sticky: thirteen unnumbered
steps read as an index, and under the one that is live, the sub-agents that have
taken the floor, one of them pulsing. On the right, a document column capped at 640px
with running text at 68ch, and the leftover right margin used the way a printed
document uses its margin — for a sticky index into the sections below. The build
is recognisable with the text blurred out, which was the point.

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
- A dense rail on its own ground against a bounded prose column.
- Monospace is reserved for what is measured or located; everything else is sans.
- Two continuous motions, never in the same row, and both survive reduced-motion.

## Colors

Greyscale ink on near-white or near-black ground, with four chromatic tokens
that are only ever allowed to report state, and one ground tint that is allowed
two jobs and no others.

### Primary

**Ground Indigo** (`colors.primary`) never appears at full strength. It ships as
two derived grounds — `primary-surface`, the banner's floor, and `primary-line`,
the rule under it — plus the selection wash, and it does exactly one thing there:
it detaches the banner from the docket, so the state you read first is not made
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

- **Verdict Green** (`colors.ok`): something passed — and, one level down, that
  something is alive. On the run it marks a finished run, a passing checklist
  line, a repo confirmed in scope; on a sub-agent row it marks an agent still
  working. The two readings cannot collide: when the run is finished, no agent is
  running, and the live one is pulsing while the finished run is not.
- **Halt Red** (`colors.ko`): something broke or stopped. The escalation notice's
  rule and 6% wash, a spent loop budget, a dropped event stream.
- **Human Blue** (`colors.human`): the run is stopped on you, and nothing moves
  until you answer. The question batch's rule and wash, the dot that replaces the
  spinner, the banner's lead word. It is the only hue that names an action you
  owe, which is why it is not shared with drift.
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
  agents that have already handed back.
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

**The State-Only Colour Rule.** Green, red, blue and amber may appear only where
they report the status of something the run produced. No chromatic token may be
used for emphasis, branding, hierarchy, decoration, or to distinguish one section
from another. Audit test: for every coloured pixel on screen, name the thing whose
state it reports. If you cannot, delete the colour.

**The Two-Level Green Rule.** Green reports "finished" on the run and "alive" on
a sub-agent, and that is allowed only because the two can never be on screen at
once — a finished run has no agent running. Any second colour tempted into a
double meaning must prove the same impossibility before it earns it.

**The Ink-Weight Now Rule.** "Now" is full-weight ink against soft and faint ink.
Done is soft, not-yet is faint, current is full and medium-weight. The banner's
indigo floor is not an exception: it separates a region, it does not say which
step is current. Marking the current step with a hue instead of ink weight is a
regression — it was scored as one in the finish review and reverted. The green
under a live step is not an exception either: it marks the agent, not the step.

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
- **Title** (500, 15px, tight tracking): docket section headings, the escalation
  headline, the question-batch headline. The largest type on the page — nothing
  is larger, and no display face exists.
- **Body** (400, 14px, `line-height: 1.625`): running prose — the Now line,
  arbitration questions and answers, scope reasons, escalation explanation.
- **UI** (400, 13px, `line-height: 1.375`): the working default for rows,
  buttons, inputs, chips, rail steps, checklist lines.
- **Meta** (400, 12px): counts, agent names, statuses, secondary explanation.
- **Legend** (500, 11px, `letter-spacing: 0.025em`, uppercase): section legends
  above a list — "Ce qui peut déraper", "Dépôts concernés", "Dans ce dossier".
  These label a list they sit directly on top of; they are never a kicker above a
  heading.
- **Measure** (mono, 12px, tabular): anything measured or located — `file:line`
  evidence, repo names, step ids, counters, ratios, clock times.

### Named Rules

**The Mono-Means-Measured Rule.** Monospace is used only for what is measured or
located: paths, line ranges, durations, timestamps, counters, ticket keys. It is
never worn as a technical costume over prose — agent names are sans, because an
agent is a who and not a measurement.

**The Tabular Column Rule.** Every number that changes in place is tabular
(`font-variant-numeric: tabular-nums`, applied globally to `time` and `.tabular`).
A counter that changes width when it changes value makes the line jump, and the
reader believes something moved.

**The Uncut Sentence Rule.** Agent-written text is shown whole or not at all. A
truncated title is more expensive than an absent one, because it is believed —
so the banner's second level shows the bounded title and then the full text
beneath it, `whitespace-pre-wrap`.

## Layout

Two columns meeting on a vertical hairline. The rail is a sticky, full-height
`aside` of fixed 304px (19rem) on its own ground, with a right border; the main
column takes the rest and is internally padded 24px.

The main column is itself a document: the docket is capped at 640px (40rem) and
its prose paragraphs at 68ch, and the space that remains to its right is a
margin, not a gap. Above 1280px that margin carries a sticky 224px section index
(`top: 64px`, `height: fit-content`) listing the docket's five sections with their
counts. Below 1280px the index disappears and only the margin remains.

The banner is sticky at the top of the main column on a 95%-opacity indigo floor
with a backdrop blur, so text scrolling under it stays legible. It holds two
levels: the shell's own vocabulary on the first — state mark, step label, agent
and tool, elapsed — and the agent's sentence on the second, indented to the step
label's left edge.

The rail's foot carries three stacked disclosures pushed down by the step list —
scope, then what to watch, then the run counters — each separated by a soft
hairline, each remembering whether it is open, and each absent entirely when it
has nothing to report. The raw event stream sits at the bottom of the main
column, collapsed by default, behind a full-width disclosure row.

**Breakpoints** (Tailwind defaults, only three of them used): `md` 768px reveals
the banner's agent/tool attribution, `lg` 1024px is the real one — below it the
rail is removed entirely and replaced by a compact strip on the rail's own ground
under the banner, `xl` 1280px reveals the docket index.

**Rhythm**: a 2/4/6/8/12/16/24/32/40px scale. Rows inside a list are 4–6px apart,
related blocks 8–12px, sections inside the rail 24px, sections inside the docket
40px. Section headers sit on a hairline with 8px of breathing room below the text.

### Named Rules

**The No-State-Loss Rule.** The page's first job is to say where the run is. Step,
state and duration are carried by the banner at every width, so they never depend
on the rail existing. What the rail alone carries — scope, loop budgets, drift —
must reappear in another form when a breakpoint removes it. Losing state at 390px
is not an acceptable responsive outcome, and neither is saying the same thing
twice at 1440px.

**The Margin-Not-Gap Rule.** The prose column is bounded at the readable measure
and the remainder is treated as a document margin. Do not widen text to fill it
and do not drop a card into it; put an index, a timestamp, or nothing there.

## Elevation & Depth

There are no shadows anywhere in this build, and none are permitted. Depth is
conveyed by exactly three devices: a one-step tonal shift (the rail's ground, the
field fill), a 1px hairline in one of two weights, and a translucent sticky
header with a backdrop blur. Two state regions — escalation and the question
batch — are washed with their state hue at 6% opacity and bounded by that hue at
40%; that wash is the closest thing to a surface in the system, and it is still
edge-to-edge with square corners.

### Named Rules

**The One-Motion-Per-Row Rule.** The page runs two continuous animations — the
spinner and the sub-agent pulse — and they are never stacked in the same place. A
step with a pulsing agent beneath it drops its spinner and keeps its full ink;
the banner carries the run's spinner permanently, so nothing is lost. Two things
moving twenty pixels apart for one living thing is one too many, and any third
continuous motion needs a state nothing else reports.

**The Folded-Signal Rule.** A section may be collapsed only if collapsing it
cannot hide a problem. A fold that carries a signal shows its count, in the
signal's hue, on its own header. If a signal cannot be summarised into the
header, the section does not get to fold.

**The Flat-Forever Rule.** No `box-shadow`, no `drop-shadow`, no simulated
lift, at rest or on any state. A surface that needs to separate from its
neighbour gets a hairline or a tonal step, and if neither reads, it is in the
wrong place in the layout.

## Shapes

Square by default. Regions — the rail, the header, the state strip, the
escalation notice, the question batch, the stream — have no radius at all; they
run edge to edge and are bounded by rules. Radius appears only on things that are
touched or picked: option chips, inputs, buttons, rail step rows and the focus
ring, all at 4px (`rounded.sm`, derived from a 6px base token). The only full
rounds in the system are the dots — scope and checklist status at 6px, sub-agents
and the current step at 8px, the banner's run mark at 10px — plus the spinner
(12px) and the scrollbar thumb. Every dot is centred in a 12px box so that a
change of state never shifts the line it sits on.

Borders are always 1px, always one of the two rule tokens, and are set globally
so that any bordered element inherits the correct colour in both schemes. The
spinner is the one exception at 1.5px, because a hairline ring at 12px would
disappear.

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
- **Ghost rows:** the rail step, the drift row and the stream disclosure are
  unstyled buttons that only announce themselves on hover — field fill and ink
  text for the rail row, field fill for the disclosure.

### Chips

- **Style:** option chips in the question batch. Field fill, 1px rule border,
  4px radius, 13px, 4px/10px padding.
- **State:** selected inverts to full ink fill with page-ground text; unselected
  hover lifts the border to faint ink and the text to full ink. Typing in the
  free-text field beside them deselects the chip, because the written answer is
  the more explicit gesture of the two.

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
and medium weight. Rows whose step produced docket content are buttons: clicking
one filters the right column to that step's decisions and marks the row with a
field fill; clicking again clears it. The current step stays marked regardless of
the filter.

**The nested level.** Under a step that ran sub-agents, one level of indent lists
them in the order they took the floor, each with an 8px dot: green alive, red
failed, blue waiting on you, faint at 50% once it has handed back. The live step
is expanded; a past step folds behind a caret, with its agent count shown only
from two upward. An agent's state comes from its last event in the step whatever
its kind, so an agent that opened a question reads as waiting even though its
last hand-over said it was starting.

Below `lg` the rail is replaced by a compact strip on the same ground: one
horizontal band under the banner carrying scope dots, loop budgets and drift
counts — and nothing the banner already says.

### The Docket (signature component)

The right column, and the reason the surface exists. Five sections — functional
arbitrations, technical arbitrations, repo scope, checklists, memory
contradictions — each introduced by a 15px heading on a hairline with its count
in monospace. No section cites a step number: the rail stopped numbering, and a
back-reference that makes you count rows is the recoupling the page exists to
remove.

Arbitrations are a two-column grid (`minmax(0,1fr)` and 2.75rem): question in
full ink medium, answer in soft ink below it, rationale in faint ink below that,
timestamp parked in the narrow right track. Evidence lines are split at the em
dash — the `file:line` half set in monospace full ink because it is a location,
the explanation half in faint prose.

Empty states are written, never hidden: "the loop hasn't started", "no repos
established yet", "retained without a written reason — check before approving the
plan". An absence is information about how far the run has got.

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

Three disclosures at the foot of the rail, in reading order: scope, what to
watch, the run's counters. Legend type, a caret, a soft hairline between them.
Open by default and remembered per viewer; a section with nothing in it is not
rendered at all, and a collapsed section that carries a signal shows its count in
drift amber on its own header.

### State Notices

Escalation and the pending question batch are full-bleed regions, square, bounded
top and bottom by their state hue at 40% over a 6% wash of the same hue. They sit
directly under the Now header, above the docket, so they take the top of the fold
without a modal, an overlay, or a scroll lock.

### Atoms

- **Spinner:** a 12px ring, 1.5px, faint at 30% with a full-ink top arc, rotating
  once every 1.1s, linear, infinite. One of the page's two continuous motions.
  Under `prefers-reduced-motion: reduce` the animation stops and opacity is held
  at 1 — frozen, never hidden, because the ring is still the marker for "here".
- **Run mark:** the banner's state in one sign — the spinner while an agent works,
  otherwise a 10px dot: `human` waiting on you, `ko` stopped, `ok` finished, faint
  at 50% at rest. Five states, one footprint, so a change of state never moves the
  line. The precedence is part of the rule: a run that escalated while a question
  was still open shows stopped, not waiting.
- **Agent dot:** 8px, full round, `ok` alive / `ko` failed / `human` waiting on
  you / faint at 50% once handed back. Only the agent that owns the latest event
  pulses — 1.6s, `ease-in-out`, to 0.4 opacity and 0.78 scale. Others still open
  stay green and still: alive is not the same as acting.
- **Status dot:** 6px, full round, `ok` / `ko` / `human` / `drift` / full ink for running
  / faint at 50% for pending. Always paired with the status word; the dot alone is
  never the only carrier of meaning.
- **Caret:** one 12px inline SVG at 1.5px, rotated 90° when open, used by every
  disclosure on the page — the rail's folds, a past step's agents, the event
  stream. One drawing, one stroke weight, one rotation centre.
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
- **Do** keep running text inside the measure — 640px for the docket column,
  68ch for prose paragraphs — and treat the remainder as a margin.
- **Do** set monospace on anything measured or located, and make every changing
  number tabular.
- **Do** theme the browser's own surfaces from the palette: selection, caret,
  focus ring, scrollbar thumb and track, underline offset.
- **Do** write empty states as sentences that say where the run is.
- **Do** restate the rail's state in another form whenever a breakpoint removes
  the rail.
- **Do** let `prefers-reduced-motion` freeze both the spinner and the pulse while
  keeping them visible.
- **Do** give every dot the same 12px footprint whatever its state, so changing
  state never moves the line it sits on.
- **Do** tint secondary text on a tinted surface from that surface's own hue, and
  darken it until it clears 4.5:1 — measure it, don't eyeball it.
- **Do** hide a rail section that has nothing in it, and surface its signal on the
  header when it is folded.

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
  monospace, at the size of their neighbours.
- **Don't** round a region. Radius belongs to things that are touched or picked.
- **Don't** let type exceed 15px, or introduce a display face. The docket heading
  is the largest thing on the page; emphasis is bought with weight, position and
  ink, never with size.
- **Don't** truncate agent-written prose without showing it in full somewhere on
  the same screen.
- **Don't** add a third continuous animation, and don't stack the two that exist
  in the same row. The spinner and the sub-agent pulse are the whole budget.
- **Don't** number the steps in the rail, and don't have the docket refer back to
  a step by number. The `<ol>` already carries position for anyone listening, and
  a back-reference that makes the reader count rows is the recoupling this page
  exists to remove.
- **Don't** use a text glyph as an icon. Rotating a `›` is not a chevron: it
  carries the font's weight and turns about its text box rather than its point.
  Draw an inline SVG at the stroke weight of the page — and draw it once: there is
  one caret atom, used by every disclosure.
