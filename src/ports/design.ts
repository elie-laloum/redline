import type { FigmaNode, FigmaRef } from "../domain/figma.ts";

export interface Design {
  readonly configured: boolean;
  /** The account behind the token, or null when the design source refuses it. */
  whoami(): Promise<{ readonly handle: string; readonly email: string } | null>;
  nodes(ref: FigmaRef, depth?: number): Promise<{ readonly name: string; readonly nodes: readonly FigmaNode[] }>;
  render(ref: FigmaRef, nodeId: string, directory: string): Promise<string | null>;
}
