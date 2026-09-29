import { mkdirSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { RedlineError } from "../domain/failure.ts";
import { type FigmaNode, frameFileName } from "../domain/figma.ts";
import type { Design } from "../ports/design.ts";
import { redact, request } from "./http.ts";

export interface FigmaCredentials {
  readonly base: string;
  readonly token: string | null;
}

type FilePayload = { name?: string; document?: FigmaNode; nodes?: Record<string, { document: FigmaNode } | null> };

export function createFigma(credentials: FigmaCredentials): Design {
  const base = credentials.base.replace(/\/+$/, "");
  const headers = { "x-figma-token": credentials.token ?? "" };

  return {
    configured: Boolean(credentials.token),

    async nodes(ref, depth = 3) {
      const query = ref.nodeId ? `?ids=${encodeURIComponent(ref.nodeId)}&depth=${depth}` : `?depth=${depth}`;
      const { data } = await request<FilePayload>(`${base}/files/${ref.fileKey}${query}`, { headers });
      const nodes = data?.nodes
        ? Object.values(data.nodes).flatMap((entry) => (entry ? [entry.document] : []))
        : data?.document
          ? [data.document]
          : [];
      return { name: data?.name ?? ref.fileKey, nodes };
    },

    async render(ref, nodeId, directory) {
      const { data } = await request<{ err: string | null; images?: Record<string, string | null> }>(
        `${base}/images/${ref.fileKey}?ids=${encodeURIComponent(nodeId)}&format=png&scale=2`,
        { headers },
      );
      if (data?.err) throw new RedlineError(`Figma a refuse le rendu du node ${nodeId}.`, data.err);
      const url = data?.images?.[nodeId];
      if (!url) return null;
      const response = await fetch(url);
      if (!response.ok) throw new RedlineError(`Le rendu de la maquette a repondu ${response.status}.`, redact(url));
      const name = frameFileName(nodeId);
      mkdirSync(directory, { recursive: true });
      const temporary = join(directory, `.${name}.${process.pid}.tmp`);
      writeFileSync(temporary, Buffer.from(await response.arrayBuffer()));
      renameSync(temporary, join(directory, name));
      return name;
    },
  };
}
