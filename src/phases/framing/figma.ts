import { defineTask, type Task } from "@elie-laloum/outpost";
import { figmaDirectory } from "../../app/paths.ts";
import { type FigmaRef, findFigmaUrls, outline, parseFigmaUrl } from "../../domain/figma.ts";
import type { TicketSnapshot } from "../../domain/ticket.ts";
import { cached, type RunContext } from "../run.ts";

export interface FigmaFrame {
  readonly url: string;
  readonly name: string;
  readonly outline: string;
  readonly image: string | null;
}

export interface FigmaBrief {
  readonly frames: readonly FigmaFrame[];
  readonly skipped: readonly string[];
}

export function figmaTask(run: RunContext, ticket: Task<TicketSnapshot>): Task<FigmaBrief> {
  const refsOf = (snapshot: TicketSnapshot): FigmaRef[] => {
    const found = [...findFigmaUrls(`${snapshot.description}\n${snapshot.links.join("\n")}`), ...run.ledger.figmaOverrides.flatMap((url) => parseFigmaUrl(url) ?? [])];
    return [...new Map(found.map((ref) => [ref.url, ref])).values()];
  };
  return defineTask({
    key: "figma",
    after: [ticket],
    cache: cached(run, [], (context) => ({ refs: refsOf(context.value(ticket)).map((ref) => ref.url), enabled: run.app.configuration.settings.services.figma })),
    async perform(context) {
      const refs = refsOf(context.value(ticket));
      if (!run.app.configuration.settings.services.figma) return { frames: [], skipped: refs.map((ref) => `${ref.url} : Figma desactive`) };
      const design = run.app.services.design;
      if (!design.configured) return { frames: [], skipped: refs.map((ref) => `${ref.url} : FIGMA_TOKEN absent`) };
      const frames: FigmaFrame[] = [];
      const skipped: string[] = [];
      const directory = figmaDirectory(run.app.paths, run.ledger.key);
      for (const ref of refs) {
        try {
          const { name, nodes } = await design.nodes(ref);
          const image = ref.nodeId ? await design.render(ref, ref.nodeId, directory) : null;
          frames.push({ url: ref.url, name, outline: nodes.flatMap((node) => outline(node)).join("\n"), image });
        } catch (error) {
          skipped.push(`${ref.url} : ${error instanceof Error ? error.message : String(error)}`);
        }
      }
      return { frames, skipped };
    },
  });
}

export function renderFigma(brief: FigmaBrief, key: string): string {
  if (brief.frames.length === 0) return brief.skipped.length ? `(aucune maquette lisible)\n${brief.skipped.map((line) => `- ${line}`).join("\n")}` : "(aucune maquette)";
  return brief.frames
    .map((frame) => [`### ${frame.name} (${frame.url})`, frame.image ? `Image : figma/${key}/${frame.image}` : "Pas d'image rendue.", frame.outline].join("\n"))
    .join("\n\n");
}
