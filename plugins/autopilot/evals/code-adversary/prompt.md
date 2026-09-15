---
max_turns: 14
allowed_tools: [Read, Glob, Grep, Agent, mcp__autopilot__get-memory, mcp__autopilot__get-repositories-registry]
---

Invoque l'agent `code-adversary`. Rends la checklist code ligne par ligne.

Checklist code du plan :
- `C1` — chemin d'erreur couvert quand la periode est invalide
- `C2` — pas de regression sur les appelants de `rangeOf`
- `C3` — cas limite : periode chevauchant deux exercices comptables
- `C4` — conventions du repo respectees

Diff livre, `packages/date-picker/src/range.tsx` :
```
- export function rangeOf(period: string) {
-   const max = endOfMonth(new Date());
+ export function rangeOf(period: string, max: Date) {
    return clamp(parse(period), max);
  }
```

Appelants connus de `rangeOf` :
- `packages/date-picker/src/picker.tsx:31` — modifie dans le diff, passe bien `max`
- `apps/sheet-lab/src/sheet-list.tsx:118` — **non modifie**, appelle `rangeOf(period)`
- `apps/annex-app/src/filters.tsx:57` — **non modifie**, appelle `rangeOf(p)`

`src/sheets.ts` du diff :
```
24  if (!isValid(period)) throw new InvalidPeriodError(period);
```

Conventions du repo, `.claude/rules/exports.md` : « tout export public porte une TSDoc ».
`rangeOf` n'en a pas dans le diff.
