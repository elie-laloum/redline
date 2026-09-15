---
max_turns: 16
allowed_tools: [Read, Glob, Grep, Write, Edit, Agent, mcp__plugin_autopilot_autopilot__get-repositories-registry, mcp__plugin_autopilot_autopilot__get-memory]
---

Invoque l'agent `test-writer`. Ecris les tests, et rien d'autre, pour ce repo.

Repo `api-client`. Types de test declares dans le registre : `ut` uniquement. `it`, `ft`,
`ct` et `e2e` valent `null`.

Code existant, `src/sheets.ts` :
```
export function getSheets(params: { status?: SheetStatus }) {
  return http.get('/sheets', { params });
}
```

Checklist tests du plan :
- `T1` — `getSheets` transmet la periode au query param `period`
- `T2` — une periode absente n'ajoute aucun query param
- `T3` — une periode invalide leve `InvalidPeriodError` avant tout appel reseau
- `T4` — le parcours complet depuis l'ecran de lab jusqu'a la liste filtree

Rends-moi les fichiers de test que tu ecrirais, et ce que tu refuses d'ecrire.
