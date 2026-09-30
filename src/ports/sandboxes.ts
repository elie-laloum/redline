import type { Sandbox } from "@elie-laloum/outpost";
import type { RepoEntry } from "../domain/config.ts";

export interface RepoWorkspace {
  readonly directory: string;
  readonly branch: string;
  withSandbox<T>(run: (sandbox: Sandbox) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

export interface ReaderSandbox {
  readonly sandbox: Sandbox;
  readonly directory: string;
  repoPath(name: string): string;
  close(): Promise<{ readonly dirty: readonly string[] }>;
}

export interface Sandboxes {
  openRepo(input: { readonly repo: RepoEntry; readonly path: string; readonly branch: string; readonly from: string; readonly signal?: AbortSignal }): Promise<RepoWorkspace>;
  openReader(input: { readonly label: string; readonly copies?: readonly string[]; readonly signal?: AbortSignal }): Promise<ReaderSandbox>;
}
