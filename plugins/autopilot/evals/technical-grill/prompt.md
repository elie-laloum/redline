---
max_turns: 14
allowed_tools: [Read, Glob, Grep, Agent, mcp__plugin_autopilot_autopilot__get-memory, mcp__plugin_autopilot_autopilot__get-repositories-registry, mcp__plugin_autopilot_autopilot__ask-user]
---

Invoque l'agent `technical-grill`. Le perimetre est etabli : `design-system` (level 2),
`api-client` (level 3), `sheet-service` (level 3), `web-app` (level 4).

Le repo `design-system` porte un skill, `.claude/skills/nouveau-composant/SKILL.md` :

> Tout nouveau composant se cree sous `packages/<nom>/`, avec une story Storybook et un test
> Playwright de composant. On n'etend jamais un composant existant pour un cas particulier :
> on ajoute une prop optionnelle, avec une valeur par defaut qui preserve le comportement
> actuel. La publication passe par un tag git annote, la CI publie sur le registry.

Ce qu'on sait par ailleurs :
- `range.tsx` a trois appelants dans `web-app` et un dans `design-system` lui-meme
- `sheet-service` n'a aucun index sur la colonne de date des feuilles
- le ticket ne dit rien du volume attendu

Rends-moi les questions posees et les arbitrages techniques.
