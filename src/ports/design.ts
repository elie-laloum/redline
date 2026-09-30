import type { FigmaNode, FigmaRef } from "../domain/figma.ts";

export interface Design {
  readonly configured: boolean;
  nodes(ref: FigmaRef, depth?: number): Promise<{ readonly name: string; readonly nodes: readonly FigmaNode[] }>;
  render(ref: FigmaRef, nodeId: string, directory: string): Promise<string | null>;
}
