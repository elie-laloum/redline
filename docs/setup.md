# Setup

[Français](setup.fr.md) · [Project overview](../README.md)

## Inspect and test first

Use the repository root in Ubuntu/WSL or a suitable Unix environment with Git, Node 22.18+ and pnpm.

```bash
pnpm install --frozen-lockfile
pnpm test
pnpm test:workflow
pnpm --dir tools/live-shell install --frozen-lockfile
pnpm typecheck
```

The two installations are separate: the root package does not install the live shell's dependencies. The optional UI can then be built with `pnpm live:build`.

## Configure a real run

Copy each template only if its destination does not already exist:

```bash
cp -n .env.example .env
cp -n autopilot.example.yaml autopilot.yaml
cp -n repositories.example.yaml repositories.yaml
cp -n plugins/autopilot/rules/voice.template.md plugins/autopilot/rules/voice.md
```

Fill in the repository registry with actual local paths, GitLab projects, base branches, dependency levels and verified commands. A `null` test command means that test family is unavailable; do not invent one. Configure budgets, naming, Jira transitions and the Slack invite allowlist in `autopilot.yaml`.

The current integration requires Jira Cloud, GitLab and Slack credentials. Slack expects a user token. Figma is optional. Review the publication behavior: operations can appear under your account. Voice instructions belong in the ignored `voice.md`; keep the public template generic.

```bash
pnpm config:check
```

This check reports required credentials as missing on an unconfigured clone and can exit nonzero. Passing unit tests does not mean a live environment is configured.

## Load the plugin

The repository contains a local marketplace at `.claude-plugin/marketplace.json` and a plugin at `plugins/autopilot/.claude-plugin/plugin.json`. Register the local marketplace and enable its `autopilot` plugin using the plugin manager in your Claude Code version. Confirm the MCP server and the `autopilot-start` skill are available before invoking a ticket. The plugin-loading flow has not been exercised as part of this documentation update.

Do not rename MCP identifiers or copy the example permissions blindly: permissions refer to the existing `autopilot` namespace. The technical names are intentionally stable during the public rebrand.

## State and recovery

The default `~/.autopilot` directory contains versioned memory and ticket state, plus disposable events, locks and worktrees. Starting an existing ticket resumes from recorded state. Inspect the skill's cleanup documentation before using `--clear`: cleanup is distinct from resuming.

Detailed original guidance, including writing-voice calibration, is preserved in the [Autopilot reference](autopilot-reference.md). Follow current setup guidance when the historical reference differs.
