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

export function parseFigmaUrl(url: string): FigmaRef | null {
  const match = /figma\.com\/(?:file|design|proto)\/([A-Za-z0-9]+)/.exec(url);
  if (!match?.[1]) return null;
  let nodeId: string | null = null;
  try {
    nodeId = new URL(url).searchParams.get("node-id")?.replace(/-/g, ":") ?? null;
  } catch {
    nodeId = null;
  }
  return { fileKey: match[1], nodeId, url };
}

export function findFigmaUrls(text: string): FigmaRef[] {
  const found = new Map<string, FigmaRef>();
  for (const candidate of text.match(/https?:\/\/[^\s)\]]*figma\.com[^\s)\]]*/g) ?? []) {
    const ref = parseFigmaUrl(candidate);
    if (ref) found.set(ref.url, ref);
  }
  return [...found.values()];
}

export function outline(node: FigmaNode, depth = 0, maxDepth = 3): string[] {
  const lines = [`${"  ".repeat(depth)}- ${node.name} [${node.type}]`];
  if (depth >= maxDepth) return lines;
  for (const child of node.children ?? []) lines.push(...outline(child, depth + 1, maxDepth));
  return lines;
}

export function frameFileName(nodeId: string): string {
  return `${nodeId.replace(/[^A-Za-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "frame"}.png`;
}
