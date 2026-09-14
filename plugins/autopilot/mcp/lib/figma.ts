import { hasSecret, optionalSecret, secret } from "./env.ts";
import { request } from "./http.ts";

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
