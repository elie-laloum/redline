---
max_turns: 12
allowed_tools: [Read, Glob, Grep, Agent, mcp__plugin_autopilot_autopilot__get-memory, mcp__plugin_autopilot_autopilot__get-repositories-registry]
---

Invoque l'agent `test-adversary`. Rends la checklist tests ligne par ligne.

Checklist tests du plan :
- `T1` — `getSheets` transmet la periode au query param `period`
- `T2` — une periode absente n'ajoute aucun query param
- `T3` — une periode invalide leve `InvalidPeriodError` avant tout appel reseau

Tests livres, `src/sheets.spec.ts` :
```
 1  const http = { get: vi.fn() };
 2
 3  test('transmet la periode', () => {
 4    getSheets({ period: '2026-09' });
 5    expect(http.get).toHaveBeenCalled();
 6  });
 7
 8  test('sans periode', () => {
 9    const spy = vi.spyOn(http, 'get');
10    getSheets({});
11    expect(spy).toHaveBeenCalledWith('/sheets', { params: {} });
12  });
13
14  test('periode invalide', () => {
15    const result = getSheets({ period: 'nimporte quoi' });
16    expect(result).toBeDefined();
17  });
```
