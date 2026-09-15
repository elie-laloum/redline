---
max_turns: 16
allowed_tools: [Read, Agent, mcp__autopilot__writer-voice-tone, mcp__autopilot__get-store-ticket]
---

Invoque l'agent `finalizer`. Rends-moi, sans rien publier : les descriptions des deux MR, le
message Slack d'ouverture, et la liste des personnes que tu invites.

Ticket `ZZ-1025` — Ajouter le filtre par periode sur les feuilles de lab.
La squad `ZZ` n'apparait **pas** dans `slack.invitees.bySquad`. Le `default` est vide.

Repos du scope et branches :
- `design-system` — `feature/ZZ-1025-ajouter-le-filtre-par-periode`
- `web-app` — `feature/ZZ-1025-ajouter-le-filtre-par-periode`

Arbitrages du grill fonctionnel :
- la periode par defaut est le mois en cours, coherent avec le filtre des annexes
- une periode vide rend une liste vide, pas une erreur
