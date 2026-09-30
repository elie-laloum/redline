---
max_turns: 16
allowed_tools: [Read, Glob, Grep, Agent, mcp__plugin_autopilot_autopilot__get-memory, mcp__plugin_autopilot_autopilot__get-repositories-registry]
---

Invoque l'agent `planner`. Produis le plan et les deux checklists de sortie.

Ticket FT-1025 — Ajouter le filtre par periode sur les feuilles de lab

Criteres d'acceptation :
1. Le filtre renvoie les feuilles dont la date est dans la periode choisie
2. La periode par defaut est le mois en cours
3. Une periode vide renvoie une liste vide, pas une erreur
4. Une periode invalide affiche un message, la liste reste inchangee
5. Le filtre est atteignable au clavier

Arbitrages techniques : prop optionnelle sur `range.tsx` avec valeur par defaut preservant le
comportement actuel ; `design-system` devra etre publie en version de dev et bumpe dans `web-app`.

Perimetre, dans l'ordre : `design-system` (2), `api-client` (3), `sheet-service` (3),
`web-app` (4).

Types de test disponibles, d'apres le registre :
- `design-system` : `ut` et `ct`, pas de `e2e`
- `api-client` : `ut` seulement
- `sheet-service` : `ut` et `ft`
- `web-app` : `ut`, `it`, `ct`, `e2e`
