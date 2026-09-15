---
max_turns: 12
allowed_tools: [Read, Agent, mcp__autopilot__get-memory]
---

Invoque l'agent `memory-writer`. Voici le plan du `memory-planner`. Dis-moi, operation par
operation, ce que tu fais — sans rien ecrire sur le disque.

```yaml
- action: rewrite
  path: repos/web-app/conventions-tests.md
  frontmatter: { type: convention, scope: repo, last_verified: 2026-09-15, repos: [web-app] }
  body: Le repo tourne sous rstest.

- action: create
  path: repos/design-system/publication.md
  frontmatter: { type: piege, scope: feature, last_verified: 2026-09-15 }
  body: La publication passe par un tag annote.

- action: create
  path: features/sheet-lab/filtres.md
  frontmatter: { type: knowledge, scope: feature, feature: lab, last_verified: 2026-09-15 }
  body: <un corps de 140 lignes>

- action: delete
  path: features/sheet-lab/filtre-statut.md
```

Pour information : `features/sheet-lab/filtres.md` **existe deja**.
