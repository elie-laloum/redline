import { BoxRenderable, type CliRenderer, type MouseEvent, ScrollBoxRenderable, TextRenderable } from "@opentui/core";
import type { TaskStatus } from "@elie-laloum/outpost";
import {
  commandsOf,
  type Dashboard,
  gatesOf,
  lanesOf,
  phaseLabel,
  progressOf,
  repoProgress,
  runUsage,
  type TaskRow,
  type Tone,
  usageSeries,
} from "../dashboard/model.ts";
import { formatDuration, formatTokens } from "../dashboard/format.ts";
import { labelOf } from "../labels.ts";
import { badge, bar, fit, type Line, span, sparkline, styled, wrap } from "./text.ts";
import { THEME, type ThemeColor } from "./theme.ts";

export type Focus = "tasks" | "inspector" | "journal";

/** What only the screen knows: selection, focus, and the banner the controller wants shown. */
export interface Screen {
  readonly selected: string | null;
  readonly follow: boolean;
  readonly focus: Focus;
  readonly notice: { readonly tone: Tone; readonly text: string } | null;
  readonly ended: boolean;
}

export interface DashboardView {
  update(state: Dashboard, screen: Screen): void;
  scroll(focus: Focus, pages: number): void;
  /** Rows the task table can show; the controller keeps the selection inside them. */
  readonly taskRows: number;
}

const STATUS: Record<TaskStatus, { readonly icon: string; readonly color: ThemeColor }> = {
  waiting: { icon: "·", color: "faint" },
  active: { icon: "▶", color: "accent" },
  "waiting-input": { icon: "?", color: "warning" },
  done: { icon: "✓", color: "success" },
  failed: { icon: "✗", color: "danger" },
  skipped: { icon: "–", color: "muted" },
  cancelled: { icon: "■", color: "warning" },
  paused: { icon: "‖", color: "warning" },
  rejected: { icon: "✗", color: "danger" },
};

const TONES: Record<Tone, ThemeColor> = { info: "text", success: "success", warning: "warning", error: "danger" };
const JOURNAL_LINES = 200;
const FOOTER = "↑↓ tache · Tab panneau · PgUp/PgDn defiler · f suivre l'active · q quitter · Ctrl-C arreter";

export function createDashboardView(renderer: CliRenderer, onSelect: (index: number) => void): DashboardView {
  const panel = (id: string, title: string, options: ConstructorParameters<typeof BoxRenderable>[1] = {}) =>
    new BoxRenderable(renderer, { id, title, border: true, borderStyle: "rounded", borderColor: THEME.border, titleColor: THEME.muted, backgroundColor: THEME.panel, paddingX: 1, ...options });
  const text = (id: string) => new TextRenderable(renderer, { id, content: "", fg: THEME.text, wrapMode: "none" });

  const root = new BoxRenderable(renderer, { id: "root", flexDirection: "column", width: "100%", height: "100%", backgroundColor: THEME.background });

  const header = panel("header", "", { height: 3, flexDirection: "row", justifyContent: "space-between" });
  const headerLeft = text("header-left");
  const headerRight = text("header-right");
  header.add(headerLeft);
  header.add(headerRight);

  const banner = panel("banner", "", { height: 3, visible: false });
  const bannerText = text("banner-text");
  banner.add(bannerText);

  const cards = new BoxRenderable(renderer, { id: "cards", flexDirection: "row", height: 5, backgroundColor: THEME.background });
  const cardTexts = (["Duree", "Tokens", "Boucle", "Depots"] as const).map((title, index) => {
    const card = panel(`card-${index}`, ` ${title} `, { flexGrow: 1, flexBasis: 0 });
    const body = text(`card-${index}-text`);
    card.add(body);
    cards.add(card);
    return body;
  });

  const main = new BoxRenderable(renderer, { id: "main", flexDirection: "row", flexGrow: 1, backgroundColor: THEME.background });
  const tasks = panel("tasks", " Taches ", { width: "58%", flexShrink: 0 });
  const tasksText = text("tasks-text");
  tasks.add(tasksText);
  const inspector = new ScrollBoxRenderable(renderer, {
    id: "inspector",
    title: " Inspecteur ",
    flexGrow: 1,
    flexBasis: 0,
    border: true,
    borderStyle: "rounded",
    borderColor: THEME.border,
    titleColor: THEME.muted,
    backgroundColor: THEME.panel,
    contentOptions: { paddingX: 1 },
  });
  const inspectorText = new TextRenderable(renderer, { id: "inspector-text", content: "", fg: THEME.text, wrapMode: "word" });
  inspector.add(inspectorText);
  main.add(tasks);
  main.add(inspector);

  const journal = new ScrollBoxRenderable(renderer, {
    id: "journal",
    title: " Journal ",
    height: "28%",
    border: true,
    borderStyle: "rounded",
    borderColor: THEME.border,
    titleColor: THEME.muted,
    backgroundColor: THEME.panel,
    stickyScroll: true,
    stickyStart: "bottom",
    contentOptions: { paddingX: 1 },
  });
  const journalText = new TextRenderable(renderer, { id: "journal-text", content: "", fg: THEME.text, wrapMode: "word" });
  journal.add(journalText);

  const footer = new TextRenderable(renderer, { id: "footer", content: styled([[span(` ${FOOTER}`, "muted")]]), height: 1, bg: THEME.background });

  for (const child of [header, banner, cards, main, journal, footer]) root.add(child);
  renderer.root.add(root);

  let offset = 0;
  let inspected: string | null = null;
  const tableRows = () => Math.max(1, (tasks.height || Math.floor(renderer.height / 2)) - 3);

  tasksText.onMouse = (event: MouseEvent) => {
    if (event.type !== "down") return;
    const row = event.y - tasksText.y - 1;
    if (row >= 0) onSelect(offset + row);
  };

  return {
    get taskRows() {
      return tableRows();
    },
    scroll(focus, pages) {
      const box = focus === "journal" ? journal : focus === "inspector" ? inspector : null;
      if (box) box.scrollBy(pages * Math.max(1, box.height - 3));
    },
    update(state, screen) {
      const width = renderer.width;
      const progress = progressOf(state);
      const selected = state.tasks.find((row) => row.key === screen.selected) ?? null;

      headerLeft.content = styled([[badge("REDLINE", "accent"), span("  "), span(state.key, "text", { bold: true }), span("  "), span(fit(state.title, Math.max(10, width - 60)).trim(), "muted")]]);
      headerRight.content = styled([
        [
          ...(state.phase ? [badge(phaseLabel(state.phase).toUpperCase(), "warning"), span(" ")] : []),
          screen.ended ? span("■ termine", "muted") : state.waiting ? span("● en attente", "warning") : span("● en cours", "success"),
        ],
      ]);

      const notice = screen.notice ?? (state.waiting ? { tone: "warning" as const, text: `EN ATTENTE DE TOI — ${labelOf(state.waiting)}` } : null);
      banner.visible = notice !== null;
      if (notice) {
        const lines = wrap(notice.text, Math.max(20, width - 6)).slice(0, 4);
        banner.height = lines.length + 2;
        banner.borderColor = THEME[TONES[notice.tone]];
        bannerText.content = styled(lines.map((line, index) => [span(line, TONES[notice.tone], { bold: index === 0 })]));
      }

      const inner = Math.max(8, Math.floor(width / 4) - 4);
      const usage = runUsage(state);
      const phaseTokens = state.usage.input + state.usage.cached + state.usage.output;
      const loopGates = gatesOf(state, state.loop);
      const loopRow = state.tasks.find((row) => row.key === state.loop);
      const repos = repoProgress(state);
      const [duration, tokens, loop, delivered] = cardTexts;
      duration!.content = styled([
        [span(formatDuration(state.now - state.startedAt), "text", { bold: true })],
        [span(fit(`${state.phase ? phaseLabel(state.phase) : "—"} · ${progress.done}/${progress.total} taches`, inner), "muted")],
        [span(bar(progress.total ? progress.done / progress.total : 0, inner), "accent")],
      ]);
      tokens!.content = styled([
        [span(formatTokens(usage.input + usage.cached + usage.output), "text", { bold: true }), span(" au total", "muted")],
        [span(fit(`phase ${formatTokens(phaseTokens)} · sortie ${formatTokens(state.usage.output)}`, inner), "muted")],
        [span(sparkline(usageSeries(state, inner)), "info")],
      ]);
      loop!.content = styled(
        loopRow
          ? [
              [span(fit(`${loopRow.label} · tour ${loopRow.round ?? "?"}`, inner), "text", { bold: true })],
              ...gateLines(loopGates, inner),
            ]
          : [[span("aucune boucle", "muted")]],
      );
      delivered!.content = styled([
        [span(`${repos.done}/${repos.total}`, "text", { bold: true }), span(" depots livres", "muted")],
        [span(fit(`en cours : ${repos.current ?? "—"}`, inner), "muted")],
        [span(bar(repos.total ? repos.done / repos.total : 0, inner), "success")],
      ]);

      const available = tableRows();
      const index = state.tasks.findIndex((row) => row.key === screen.selected);
      offset = Math.max(0, Math.min(index - Math.floor(available / 2), state.tasks.length - available));
      const tableWidth = Math.max(30, (tasks.width || Math.floor(width * 0.58)) - 4);
      const columns = tableWidth >= 70 ? COLUMNS : COLUMNS.filter((column) => column.title === "duree");
      const columnsWidth = columns.reduce((total, column) => total + column.width, 0);
      tasksText.content = styled([
        [span(fit(`   ${"Tache".padEnd(tableWidth - 3 - columnsWidth)}${columns.map((column) => column.title.padStart(column.width)).join("")}`, tableWidth), "muted", { bold: true })],
        ...state.tasks.slice(offset, offset + available).map((row) => taskLine(row, state.now, tableWidth, columns, row.key === screen.selected)),
      ]);

      const inspectorWidth = Math.max(20, (inspector.width || Math.floor(width * 0.42)) - 4);
      if (selected?.key !== inspected) {
        inspected = selected?.key ?? null;
        inspector.scrollTop = 0;
      }
      inspectorText.content = styled(selected ? inspect(state, selected, inspectorWidth) : [[span("Aucune tache selectionnee.", "muted")]]);

      const journalWidth = Math.max(20, width - 6);
      journalText.content = styled(
        state.journal.slice(-JOURNAL_LINES).map((entry) => [
          span(`${clock(entry.at)} `, "faint"),
          span(fit(entry.text, journalWidth - 9 - (entry.url ? Math.min(entry.url.length + 1, 60) : 0)).trimEnd(), TONES[entry.tone]),
          ...(entry.url ? [span(` ${entry.url}`, "info")] : []),
        ]),
      );

      for (const [box, focus] of [
        [tasks, "tasks"],
        [inspector, "inspector"],
        [journal, "journal"],
      ] as const) {
        box.borderColor = screen.focus === focus ? THEME.focus : THEME.border;
      }
    },
  };
}

function gateLines(gates: ReturnType<typeof gatesOf>, width: number): Line[] {
  if (gates.length === 0) return [[span("pas encore de verdict", "muted")]];
  const cells = gates.map((gate) => ({ text: `${gate.gate} ${gate.spent}/${gate.budget}`, color: (gate.spent > gate.budget ? "danger" : gate.verdict === "pass" ? "success" : "warning") as ThemeColor }));
  const lines: Line[] = [];
  let line: ReturnType<typeof span>[] = [];
  let used = 0;
  for (const cell of cells) {
    if (used > 0 && used + 3 + cell.text.length > width) {
      lines.push(line);
      line = [];
      used = 0;
    }
    if (used > 0) line.push(span(" · ", "faint"));
    line.push(span(cell.text, cell.color));
    used += (used > 0 ? 3 : 0) + cell.text.length;
  }
  lines.push(line);
  return lines.slice(0, 2);
}

interface Column {
  readonly title: string;
  readonly width: number;
  cell(row: TaskRow, now: number): string;
}

const COLUMNS: readonly Column[] = [
  { title: "essais", width: 7, cell: (row) => (row.attempts ? String(row.attempts) : "") },
  { title: "tour", width: 6, cell: (row) => (row.round ? String(row.round) : "") },
  { title: "duree", width: 12, cell: (row, now) => (row.startedAt ? formatDuration((row.finishedAt ?? now) - row.startedAt) : "") },
  { title: "tokens", width: 8, cell: (row) => (row.tokens ? formatTokens(row.tokens) : "") },
];

function taskLine(row: TaskRow, now: number, width: number, columns: readonly Column[], selected: boolean): Line {
  const status = STATUS[row.status];
  const label = `${row.label}${row.cached ? " (cache)" : ""}`;
  const cells = columns.map((column) => column.cell(row, now).padStart(column.width)).join("");
  const background = selected ? { bg: "selection" as const } : {};
  return [
    span(` ${status.icon} `, status.color, { bold: row.status === "active", ...background }),
    span(fit(label, width - 3 - cells.length), row.status === "waiting" ? "muted" : "text", { bold: row.status === "active", ...background }),
    span(cells, "muted", background),
  ];
}

function inspect(state: Dashboard, row: TaskRow, width: number): Line[] {
  const status = STATUS[row.status];
  const lines: Line[] = [[span(row.label, "text", { bold: true }), span(`  ${status.icon} ${row.status}`, status.color)]];
  if (row.error) lines.push(...wrap(row.error, width).map((line): Line => [span(line, "danger")]));

  const gates = gatesOf(state, row.key);
  if (gates.length) {
    lines.push([], [span("Juges", "muted", { bold: true })]);
    for (const gate of gates) {
      const color: ThemeColor = gate.spent > gate.budget ? "danger" : gate.verdict === "pass" ? "success" : "warning";
      lines.push([span(`${gate.verdict === "pass" ? "✓" : "✗"} ${gate.gate}`, color), span(`  tour ${gate.round} · ${gate.spent}/${gate.budget}`, "muted")]);
      if (gate.text) lines.push(...wrap(gate.text, width - 2).slice(0, 6).map((line): Line => [span(`  ${line}`, "muted")]));
    }
  }

  const commands = commandsOf(state, row.key).slice(-6);
  if (commands.length) {
    lines.push([], [span("Commandes", "muted", { bold: true })]);
    for (const command of commands) {
      const color: ThemeColor = command.status === "running" ? "accent" : command.status === "passed" ? "success" : "danger";
      const icon = command.status === "running" ? "…" : command.status === "passed" ? "✓" : "✗";
      const detail = command.status === "failed" ? ` · code ${command.exitCode ?? "?"}${command.logPath ? ` · ${command.logPath}` : ""}` : "";
      lines.push([span(`${icon} ${command.label}`, color), span(fit(` ${formatDuration(command.elapsedMs)}${detail}`, width - command.label.length - 2).trimEnd(), "muted")]);
    }
  }

  for (const lane of lanesOf(state, row.key)) {
    lines.push([], [span(`── ${lane.role}${lane.lane ? ` · ${lane.lane}` : ""} `, "accent", { bold: true })]);
    for (const tool of lane.tools.slice(-5)) lines.push([span(fit(`› ${tool}`, width).trimEnd(), "muted")]);
    const said = [lane.text, lane.draft].filter(Boolean).join("\n\n");
    if (said) lines.push(...wrap(said, width).slice(-14).map((line): Line => [span(line)]));
  }
  if (lines.length === 1 && row.status === "waiting") lines.push([span("En attente de ses dependances.", "muted")]);
  return lines;
}

function clock(at: number): string {
  return new Date(at).toTimeString().slice(0, 8);
}
