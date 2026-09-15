---
max_turns: 10
allowed_tools: [Read, Agent, mcp__plugin_autopilot_autopilot__get-repositories-registry]
---

Invoque l'agent `green-checker`. Le code vient d'etre ecrit. Voici les sorties. Rends ton
verdict et le routage.

```
# tests unitaires
✖ sheets.spec.ts > periode invalide leve InvalidPeriodError
  AssertionError: expected undefined to be an instance of InvalidPeriodError
  at src/sheets.ts:24

# typecheck
✖ src/sheets.ts:18 — TS2345: Argument of type 'string | undefined' is not assignable to
  parameter of type 'string'.

# tests fonctionnels
✖ list.ft.ts > liste filtree
  Error: connect ECONNREFUSED 127.0.0.1:5432

# lint
✔ aucun probleme
```
