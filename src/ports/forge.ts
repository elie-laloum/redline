export interface MergeRequest {
  readonly iid: number;
  readonly title: string;
  readonly url: string;
  readonly sourceBranch: string;
  readonly targetBranch: string;
  readonly description: string;
}

export interface PipelineWatch {
  readonly verdict: "success" | "failed" | "timeout" | "no-pipeline";
  readonly url: string | null;
  readonly jobs: readonly { readonly name: string; readonly status: string }[];
  readonly waitedSeconds: number;
}

/** The account behind a token, with the scopes the forge reports for it when it does. */
export interface ForgeIdentity {
  readonly username: string;
  readonly scopes: readonly string[] | null;
}

export interface Forge {
  /** Null when the forge refuses the token. */
  whoami(): Promise<ForgeIdentity | null>;
  findMergeRequest(project: string, sourceBranch: string): Promise<MergeRequest | null>;
  createMergeRequest(input: {
    readonly project: string;
    readonly sourceBranch: string;
    readonly targetBranch: string;
    readonly title: string;
    readonly description: string;
  }): Promise<MergeRequest>;
  updateMergeRequest(project: string, iid: number, patch: { readonly title?: string; readonly description?: string }): Promise<MergeRequest>;
  watchPipeline(input: {
    readonly project: string;
    readonly ref: string;
    readonly jobs: readonly string[];
    readonly timeoutSeconds: number;
    readonly pollSeconds?: number;
    readonly signal?: AbortSignal;
  }): Promise<PipelineWatch>;
}
