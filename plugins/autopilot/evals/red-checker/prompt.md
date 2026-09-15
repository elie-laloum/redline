---
max_turns: 10
allowed_tools: [Read, Agent, mcp__plugin_autopilot_autopilot__get-repositories-registry]
---

Invoque l'agent `red-checker`. Les tests viennent d'etre ecrits, aucune implementation n'a
encore eu lieu. Voici la sortie du runner. Rends ton verdict test par test.

```
✖ sheets.spec.ts > transmet la periode au query param
  AssertionError: expected { params: {} } to deeply equal { params: { period: '2026-09' } }

✖ sheets.spec.ts > periode invalide leve InvalidPeriodError
  Error: Cannot find module '../errors/invalid-period' imported from src/sheets.ts

✖ range.spec.ts > la borne haute suit la prop
  TS2554: Expected 1 arguments, but got 2.

✔ range.spec.ts > la borne haute par defaut reste le mois courant

✖ list.spec.ts > filtre par periode
  TypeError: repo.listByPeriod is not a function
```
