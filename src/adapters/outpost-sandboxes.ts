import { existsSync } from "node:fs";
import { createSandbox, openWorkspace, type SandboxProvider } from "@elie-laloum/outpost";
import { createDockerSandboxProvider } from "@elie-laloum/outpost/providers/docker";
import { createLocalSandboxProvider } from "@elie-laloum/outpost/providers/local";
import type { Registry, Settings } from "../domain/config.ts";
import type { ReaderSandbox, RepoWorkspace, Sandboxes } from "../ports/sandboxes.ts";
import { git, workingChanges } from "./git.ts";

export interface SandboxOptions {
  readonly settings: Settings;
  readonly registry: Registry;
  readonly home: string;
  readonly resolvePath: (path: string) => string;
  readonly isolation: "docker" | "local";
}

export function createOutpostSandboxes(options: SandboxOptions): Sandboxes {
  const { sandbox } = options.settings;
  const mounted = options.registry.repositories.filter((repo) => existsSync(options.resolvePath(repo.path)));
  const docker = (volumes: { source: string; target: string; readOnly: boolean }[]): SandboxProvider =>
    createDockerSandboxProvider({ image: sandbox.image, volumes, ...(sandbox.cpus ? { cpus: sandbox.cpus } : {}), ...(sandbox.memoryMb ? { memoryMb: sandbox.memoryMb } : {}) });
  const repoProvider = options.isolation === "docker" ? docker([]) : createLocalSandboxProvider();
  const readerProvider =
    options.isolation === "docker"
      ? docker(mounted.map((repo) => ({ source: options.resolvePath(repo.path), target: `/repos/${repo.name}`, readOnly: true })))
      : createLocalSandboxProvider();
  const repoPath = (name: string) => {
    const repo = options.registry.repositories.find((entry) => entry.name === name);
    if (!repo) return name;
    return options.isolation === "docker" ? `/repos/${repo.name}` : options.resolvePath(repo.path);
  };

  return {
    async openRepo(input): Promise<RepoWorkspace> {
      const workspace = await openWorkspace({
        repository: input.path,
        branch: { mode: "named", name: input.branch, from: input.from },
        copies: input.repo.localFiles,
        label: input.repo.name,
        signal: input.signal,
      });
      return {
        directory: workspace.directory,
        branch: workspace.branch,
        async withSandbox(run) {
          const opened = await workspace.sandbox({ sandboxProvider: repoProvider });
          try {
            return await run(opened);
          } finally {
            await opened.close();
          }
        },
        close: async () => {
          await workspace.close({ preserve: true });
        },
      };
    },

    async openReader(input): Promise<ReaderSandbox> {
      const opened = await createSandbox({
        repository: options.home,
        sandboxProvider: readerProvider,
        branch: { mode: "integrate" },
        label: input.label,
        copies: input.copies,
        signal: input.signal,
      });
      const directory = opened.workspace.directory;
      return {
        sandbox: opened,
        directory,
        repoPath,
        async close() {
          const dirty = await workingChanges(directory).catch(() => []);
          if (dirty.length > 0) {
            await git(directory, ["reset", "--hard", "-q"]);
            await git(directory, ["clean", "-fdq"]);
          }
          await opened.close();
          return { dirty };
        },
      };
    },
  };
}
