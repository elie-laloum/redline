import * as figma from "../lib/figma.ts";
import { arr, num, obj, str } from "../lib/schema.ts";
import { type AnyTool, defineTool } from "../lib/tool.ts";

/**
 * Les maquettes sont cherchees d'abord dans le ticket, puis completees par les
 * `--figma` de la ligne de commande. C'est le cas courant chez nous : la
 * maquette existe mais n'est pas toujours accrochee au ticket.
 *
 * Ni la detection ni le flag ne sont obligatoires. L'absence de maquette ne
 * rend jamais la main sur une erreur.
 */

export const figmaTools: AnyTool[] = [
  defineTool({
    name: "get-figma-components",
    description:
      "Rend l'arborescence des composants d'une ou plusieurs maquettes. Les URL viennent du ticket Jira ET des --figma passes en ligne de commande, les deux s'additionnent. Sans maquette ou sans jeton Figma, le tool rend une absence et le run continue.",
    inputSchema: obj(
      {
        urls: arr("URL Figma a lire.", str("URL de fichier ou de node Figma.")),
        searchIn: str("Texte ou chercher des URL Figma, typiquement la description du ticket."),
        depth: num("Profondeur d'arborescence rendue. 3 par defaut."),
      },
      [],
    ),
    handler: async (input: { urls?: string[]; searchIn?: string; depth?: number }) => {
      const refs = [
        ...(input.searchIn ? figma.findUrls(input.searchIn) : []),
        ...(input.urls ?? []).map(figma.parseUrl).filter((ref): ref is figma.FigmaRef => ref !== null),
      ];
      const unique = [...new Map(refs.map((ref) => [ref.url, ref])).values()];

      if (unique.length === 0) {
        return {
          found: false,
          files: [],
          note: "Aucune maquette. Ce n'est pas un echec : beaucoup de tickets n'en ont pas, le run continue.",
        };
      }
      if (!figma.isConfigured()) {
        return {
          found: true,
          files: unique.map((ref) => ({ url: ref.url, fileKey: ref.fileKey, nodeId: ref.nodeId, readable: false })),
          note: "Des maquettes sont referencees mais FIGMA_TOKEN n'est pas configure. Signale-le a l'humain plutot que de deviner ce qu'elles contiennent.",
        };
      }

      const files = [];
      for (const ref of unique) {
        try {
          const file = await figma.getComponents(ref, input.depth ?? 3);
          files.push({
            url: ref.url,
            fileKey: ref.fileKey,
            nodeId: ref.nodeId,
            name: file.name,
            readable: true,
            outline: file.nodes.flatMap((node) => figma.outline(node, 0, input.depth ?? 3)),
          });
        } catch (error) {
          files.push({
            url: ref.url,
            fileKey: ref.fileKey,
            nodeId: ref.nodeId,
            readable: false,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
      return { found: true, files };
    },
  }),

  defineTool({
    name: "get-figma-component",
    description: "Rend le detail d'un composant precis d'une maquette, une fois qu'il a ete repere dans l'arborescence.",
    inputSchema: obj({ url: str("URL du fichier Figma."), nodeId: str("Identifiant du node, forme 123:456.") }, ["url", "nodeId"]),
    handler: async ({ url, nodeId }: { url: string; nodeId: string }) => {
      const ref = figma.parseUrl(url);
      if (!ref) return { error: `URL Figma non reconnue : ${url}` };
      if (!figma.isConfigured()) return { readable: false, note: "FIGMA_TOKEN absent." };
      const node = await figma.getComponent(ref, nodeId);
      return node ? { readable: true, node } : { readable: false, note: `Node ${nodeId} introuvable.` };
    },
  }),
];
