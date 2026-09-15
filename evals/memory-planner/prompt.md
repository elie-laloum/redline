---
max_turns: 14
allowed_tools: [Read, Glob, Grep, Agent, mcp__autopilot__get-memory, mcp__autopilot__get-repositories-registry]
---

Invoque l'agent `memory-planner`. Produis le plan memoire du ticket FT-1025.

Contradictions empilees pendant le run :
| Note | Affirmation | Preuve | Signale par |
|---|---|---|---|
| `repos/web-app/conventions-tests.md` | Le repo utilise vitest | `package.json:31` — rstest | scope-scout |
| `repos/sheet-service/endpoints.md` | `GET /sheets` n'accepte que `status` | `list.ts:60` — accepte aussi `period` depuis ce ticket | developer |

Notes existantes qui se recouvrent :
- `features/sheet-lab/filtres.md` — « un filtre par statut existe »
- `features/sheet-lab/filtre-statut.md` — « le filtre par statut passe par un query param »
- `changes/FT-0912.md` — « FT-0912 a ajoute le filtre par statut, via un query param »

Ce que le run a appris :
- le `date-picker` du design system figeait sa borne haute, c'est desormais une prop
- `design-system` se publie par un tag annote, la CI publie sur le registry
- le chevauchement de deux exercices comptables n'a **pas** ete tranche, il reste ouvert
