# Architecture

Redline is the public identity of the existing Autopilot implementation.

## Three layers

1. **Skill and agents:** `plugins/autopilot/skills/autopilot-start` defines the workflow; `plugins/autopilot/agents` contains 15 role definitions. Claude Code performs orchestration and judgment.
2. **Deterministic tools:** `plugins/autopilot/mcp/server.ts` serves the registry over MCP. Tool families handle configuration, state, memory, Git, checks, Jira, GitLab, Slack, Figma and human interaction.
3. **State and visibility:** ticket YAML, versioned memory and event logs support resumption. The optional `tools/live-shell` app reads the run and exposes human questions.

## Decisions worth preserving

- Dependency levels are declared and validated. Upstream work can be published before downstream work starts.
- Test generation and implementation are separate. A red checker distinguishes expected assertion failures from unrelated failures.
- Test and code adversaries challenge results. Their effectiveness needs model evaluations as well as deterministic tests.
- `TOOLS_BY_AGENT` declares role-specific tool access, and permission tests check alignment with agent definitions. This is not process isolation.
- Memory contradictions are explicit inputs to consolidation. Retrieval uses metadata and text search.
- Publication is not an atomic transaction across external services. A partial failure can leave externally visible changes.

## Repository map

| Path | Role |
|---|---|
| `autopilot.example.yaml` | Workflow settings |
| `repositories.example.yaml` | Repository graph, commands and infrastructure |
| `plugins/autopilot/mcp/registry.ts` | Tool registry and agent/tool mapping |
| `plugins/autopilot/agents/` | Role instructions |
| `plugins/autopilot/evals/` | Agent evaluation cases |
| `tests/unit/` | Deterministic tests |
| `tests/workflow/` | Scripted integration scenarios |
| `tools/live-shell/` | Optional progress UI |

## Naming compatibility

Keep `autopilot.yaml`, `AUTOPILOT_*`, `~/.autopilot`, MCP identifiers, plugin names and the skill unchanged for this documentation release. A future technical rename needs compatibility aliases, state migration and tests for existing sessions. Renaming the GitHub repository does not require that migration.
