---
max_turns: 16
allowed_tools: [Read, Glob, Grep, Agent, mcp__plugin_autopilot_autopilot__get-memory, mcp__plugin_autopilot_autopilot__get-repositories-registry]
---

Invoque l'agent `scope-scout`. Determine le perimetre du ticket ci-dessous a partir du
materiel fourni, sans rien implementer.

Ticket FT-1025 — Ajouter le filtre par periode sur les feuilles de lab
Arbitrages fonctionnels : la periode par defaut est le mois en cours ; une periode vide rend
une liste vide, pas une erreur.

Extraits de code reels :

`~/Projects/gitlab/web-app/apps/sheet-lab/src/sheet-list.tsx`
```
114  const { data } = useSheets({ status });
115
116  return (
117    <DataGrid rows={data ?? []}>
118      <StatusFilter value={status} onChange={setStatus} />
```

`~/Projects/gitlab/api-client/src/sheets.ts`
```
40  export function getSheets(params: { status?: SheetStatus }) {
41    return http.get('/sheets', { params });
42  }
```

`~/Projects/gitlab/node.js/services/sheet-service/src/routes/sheets/list.ts`
```
60  const schema = { querystring: { status: { type: 'string' } } };
64  const rows = await repo.list({ status: request.query.status });
```

`~/Projects/gitlab/design-system/packages/date-picker/src/range.tsx`
```
42  // borne haute figee au dernier jour du mois courant
43  const max = endOfMonth(new Date());
```

Le registre contient aussi `ui-theme`, `db-installer` et `db-schema`. Le mot
« tableau » du ticket fait remonter `design-system` par mots-cles, mais le composant
`DataGrid` de la liste vient en realite de `@acme/design-system` **sans modification
necessaire** : c'est le `date-picker` qui bloque, parce que sa borne haute est figee.
