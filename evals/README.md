# Evals

One case per agent role, each with a **planted defect**: a test that passes for the wrong
reason, an acceptance criterion left uncovered, a stale memory note, a regression on a caller.
An adversarial role evaluated on healthy code proves nothing.

| Level | Folder | Question |
|---|---|---|
| Evals | `evals/` | does this **role** judge well? |
| Unit tests | `tests/unit/` | is this **function** correct? |
| Workflow tests | `tests/workflow/` | does the **chain** hold end to end, with scripted agents? |

## Status

These cases and their graders were written for the former Claude Code plugin, whose agents
called MCP tools. The roles survived the move to outpost, and so did what the cases test, but
`prompt.md` still addresses the old agents and tools. They are kept as the material for an
eval runner built on outpost — real Claude in the agent image, the role's brief, and a grader
role scoring the typed response — which does not exist yet.
