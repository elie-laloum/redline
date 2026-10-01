import { BoxRenderable, type CliRenderer, type KeyEvent, TextRenderable } from "@opentui/core";
import type { RunSummary } from "../../app/runs.ts";
import type { RunPhase } from "../../domain/run-events.ts";
import { formatAge } from "../dashboard/format.ts";
import { phaseLabel } from "../dashboard/model.ts";
import { badge, fit, type Line, span, styled } from "./text.ts";
import { THEME, type ThemeColor } from "./theme.ts";

const FOOTER = "↑↓ choisir · Entree ouvrir · tape pour filtrer · Esc quitter";
const REFRESH_MS = 2000;

/** The home's runs, to choose one to watch: resolves with its key, or null when the human leaves. */
export function pickRun(renderer: CliRenderer, list: () => readonly RunSummary[]): Promise<string | null> {
  const box = (id: string, options: ConstructorParameters<typeof BoxRenderable>[1]) =>
    new BoxRenderable(renderer, { id, border: true, borderStyle: "rounded", borderColor: THEME.border, titleColor: THEME.muted, backgroundColor: THEME.panel, paddingX: 1, ...options });
  const text = (id: string) => new TextRenderable(renderer, { id, content: "", fg: THEME.text, wrapMode: "none" });

  const root = new BoxRenderable(renderer, { id: "picker", flexDirection: "column", width: "100%", height: "100%", backgroundColor: THEME.background });
  const header = box("picker-header", { height: 3 });
  const headerText = text("picker-header-text");
  header.add(headerText);
  const body = box("picker-body", { title: " Runs ", flexGrow: 1, borderColor: THEME.focus });
  const bodyText = text("picker-body-text");
  body.add(bodyText);
  const footer = new TextRenderable(renderer, { id: "picker-footer", content: styled([[span(` ${FOOTER}`, "muted")]]), height: 1, bg: THEME.background });
  for (const child of [header, body, footer]) root.add(child);
  renderer.root.add(root);

  let runs = list();
  let filter = "";
  let selected: string | null = runs[0]?.key ?? null;

  const shown = () => {
    const needle = filter.toLowerCase();
    return runs.filter((run) => !needle || `${run.key} ${run.title}`.toLowerCase().includes(needle));
  };
  const draw = () => {
    if (renderer.isDestroyed) return;
    const rows = shown();
    if (!rows.some((run) => run.key === selected)) selected = rows[0]?.key ?? null;
    headerText.content = styled([[badge("REDLINE", "accent"), span("  "), span("Runs", "text", { bold: true }), span(`  filtre : ${filter || "—"}`, "muted")]]);
    const height = Math.max(1, (body.height || renderer.height - 6) - 2);
    const index = rows.findIndex((run) => run.key === selected);
    const offset = Math.max(0, Math.min(index - Math.floor(height / 2), rows.length - height));
    const width = Math.max(40, renderer.width - 6);
    const now = Date.now();
    bodyText.content = styled(
      rows.length === 0
        ? [[span(runs.length ? "Aucun run ne correspond au filtre." : "Aucun run.", "muted")]]
        : rows.slice(offset, offset + height).map((run) => runLine(run, width, run.key === selected, now)),
    );
    renderer.requestRender();
  };
  const move = (step: number) => {
    const rows = shown();
    const index = rows.findIndex((run) => run.key === selected);
    selected = rows[Math.max(0, Math.min(rows.length - 1, index + step))]?.key ?? selected;
    draw();
  };

  return new Promise((resolve) => {
    const done = (key: string | null) => {
      clearInterval(refresh);
      renderer.keyInput.off("keypress", onKey);
      renderer.off("resize", draw);
      root.destroyRecursively();
      resolve(key);
    };
    const onKey = (key: KeyEvent) => {
      if (key.ctrl && key.name === "c") return done(null);
      if (key.name === "escape") {
        if (!filter) return done(null);
        filter = "";
        return draw();
      }
      if (key.name === "q" && !filter) return done(null);
      if (key.name === "return") return selected ? done(selected) : undefined;
      if (key.name === "up") return move(-1);
      if (key.name === "down") return move(1);
      if (key.name === "pageup" || key.name === "pagedown") return move((key.name === "pageup" ? -1 : 1) * Math.max(1, renderer.height - 8));
      if (key.name === "backspace") {
        filter = filter.slice(0, -1);
        return draw();
      }
      if (!key.ctrl && !key.meta && key.sequence.length === 1 && key.sequence >= " ") {
        filter += key.sequence;
        draw();
      }
    };
    // Runs start and end in other terminals while the list is open.
    const refresh = setInterval(() => {
      runs = list();
      draw();
    }, REFRESH_MS);
    renderer.keyInput.on("keypress", onKey);
    renderer.on("resize", draw);
    draw();
  });
}

function runLine(run: RunSummary, width: number, selected: boolean, now: number): Line {
  const state = stateOf(run);
  const background = selected ? { bg: "selection" as const } : {};
  const fixed = `${run.key.padEnd(12)} ${state.text.padEnd(30)} ${formatAge(now - Date.parse(run.updatedAt)).padEnd(14)} `;
  return [
    span(` ${state.icon} `, state.color, { bold: run.running !== null, ...background }),
    span(fit(fixed, Math.min(fixed.length, width - 3)), "text", { bold: run.running !== null, ...background }),
    span(fit(run.title, Math.max(0, width - 3 - fixed.length)), "muted", background),
  ];
}

function stateOf(run: RunSummary): { readonly icon: string; readonly color: ThemeColor; readonly text: string } {
  if (run.running !== null) return { icon: "▶", color: "accent", text: `en cours · pid ${run.running}` };
  switch (run.phase) {
    case "done":
      return { icon: "✓", color: "success", text: "publie" };
    case "escalated":
      return { icon: "✗", color: "danger", text: `escalade ${run.escalation ?? ""}`.trim() };
    default:
      return { icon: "·", color: "muted", text: `arrete en ${phaseLabel(run.phase as RunPhase).toLowerCase()}` };
  }
}
