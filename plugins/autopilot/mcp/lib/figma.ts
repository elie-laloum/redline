import { mkdirSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { hasSecret, optionalSecret, secret } from "./env.ts";
import { ToolError } from "./errors.ts";
import { redact, request } from "./http.ts";

/**
 * Les maquettes sont facultatives. Beaucoup de tickets n'en ont pas, et le run
 * ne s'interrompt jamais pour ca : ces tools rendent une absence, pas une
 * erreur.
 */

export interface FigmaRef {
  readonly fileKey: string;
  readonly nodeId: string | null;
  readonly url: string;
}

export interface FigmaNode {
  readonly id: string;
  readonly name: string;
  readonly type: string;
  readonly children?: readonly FigmaNode[];
}

function base(): string {
  return (optionalSecret("FIGMA_API_BASE") ?? "https://api.figma.com/v1").replace(/\/+$/, "");
}

export function isConfigured(): boolean {
  return hasSecret("FIGMA_TOKEN");
}

/** Accepte les deux formes d'URL, `/file/` et `/design/`, avec ou sans node-id. */
export function parseUrl(url: string): FigmaRef | null {
  const match = /figma\.com\/(?:file|design|proto)\/([A-Za-z0-9]+)/.exec(url);
  if (!match?.[1]) return null;
  let nodeId: string | null = null;
  try {
    const raw = new URL(url).searchParams.get("node-id");
    if (raw) nodeId = raw.replace(/-/g, ":");
  } catch {
    nodeId = null;
  }
  return { fileKey: match[1], nodeId, url };
}

export function findUrls(text: string): FigmaRef[] {
  const found = new Map<string, FigmaRef>();
  for (const candidate of text.match(/https?:\/\/[^\s)\]]*figma\.com[^\s)\]]*/g) ?? []) {
    const ref = parseUrl(candidate);
    if (ref) found.set(ref.url, ref);
  }
  return [...found.values()];
}

export async function getComponents(ref: FigmaRef, depth = 3): Promise<{ name: string; nodes: FigmaNode[] }> {
  const query = ref.nodeId ? `?ids=${encodeURIComponent(ref.nodeId)}&depth=${depth}` : `?depth=${depth}`;
  const { data } = await request<{ name: string; document: FigmaNode; nodes?: Record<string, { document: FigmaNode }> }>(
    `${base()}/files/${ref.fileKey}${query}`,
    { headers: { "x-figma-token": secret("FIGMA_TOKEN") } },
  );
  const nodes = data.nodes
    ? Object.values(data.nodes).map((entry) => entry.document)
    : data.document
      ? [data.document]
      : [];
  return { name: data.name ?? ref.fileKey, nodes };
}

export async function getComponent(ref: FigmaRef, nodeId: string): Promise<FigmaNode | null> {
  const { data } = await request<{ nodes: Record<string, { document: FigmaNode } | null> }>(
    `${base()}/files/${ref.fileKey}/nodes?ids=${encodeURIComponent(nodeId)}`,
    { headers: { "x-figma-token": secret("FIGMA_TOKEN") } },
  );
  return data?.nodes?.[nodeId]?.document ?? null;
}

/** Un arbre Figma complet noie un contexte. On rend une arborescence lisible. */
export function outline(node: FigmaNode, depth = 0, maxDepth = 3): string[] {
  const lines = [`${"  ".repeat(depth)}- ${node.name} [${node.type}]`];
  if (depth >= maxDepth) return lines;
  for (const child of node.children ?? []) lines.push(...outline(child, depth + 1, maxDepth));
  return lines;
}

/**
 * Le pixel de la maquette, et pas seulement son arborescence.
 *
 * Un `outline` dit `Dialog > Title / content / buttons` — de quoi nommer les
 * composants, jamais de quoi verifier qu'on a compris la meme chose que le
 * designer. La maquette est une source au meme titre que la description du
 * ticket, et une source qu'on ne peut pas relire n'en est pas une.
 *
 * Figma rend une URL S3 signee, valable une poignee de dizaines de minutes. On
 * ne la garde donc pas : on tire le PNG tout de suite et c'est le fichier qui
 * fait foi ensuite. C'est aussi ce qui rend le rejeu possible hors ligne.
 */
export async function renderFrame(
  ref: FigmaRef,
  nodeId: string,
  scale = 2,
): Promise<{ url: string } | null> {
  const { data } = await request<{ err: string | null; images: Record<string, string | null> }>(
    `${base()}/images/${ref.fileKey}?ids=${encodeURIComponent(nodeId)}&format=png&scale=${scale}`,
    { headers: { "x-figma-token": secret("FIGMA_TOKEN") } },
  );
  if (data?.err) throw new ToolError(`Figma a refuse le rendu du node ${nodeId}.`, data.err);
  const url = data?.images?.[nodeId];
  return url ? { url } : null;
}

/**
 * Le PNG sur disque, sous un nom qui ne peut pas sortir de son dossier.
 *
 * Un `nodeId` est de la forme `7155:19416`, mais il vient d'une URL que
 * quelqu'un a collee : il traverse un nom de fichier, donc on ne lui fait pas
 * confiance. Tout ce qui n'est pas alphanumerique devient un tiret.
 */
export async function downloadFrame(url: string, dir: string, nodeId: string): Promise<string> {
  const name = `${nodeId.replace(/[^A-Za-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "frame"}.png`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new ToolError(`Le rendu de la maquette a repondu ${response.status}.`, redact(url));
  }
  const bytes = Buffer.from(await response.arrayBuffer());
  mkdirSync(dir, { recursive: true });
  // Ecriture atomique : le shell surveille ce dossier et servirait volontiers
  // un fichier a moitie ecrit, qui s'afficherait comme une image cassee.
  const temp = join(dir, `.${name}.${process.pid}.tmp`);
  writeFileSync(temp, bytes);
  renameSync(temp, join(dir, name));
  return name;
}
