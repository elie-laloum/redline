---
type: llm
weight: 1
---

# Le plan suit-il les level, et prevoit-il la publication amont ?

## Reussite
- Le plan se lit repo par repo dans l'ordre 2 → 3 → 3 → 4
- Le plan dit explicitement que `design-system` demande un tag de version de dev, un pipeline
  vert, puis un bump dans `web-app` — dans cet ordre
- Aucun type de test absent d'un repo n'est introduit : pas de `e2e` dans `design-system`,
  pas de `ct` dans `api-client`

## Echec
- `web-app` planifie avant `design-system`
- La publication amont oubliee, alors que `web-app` consomme `design-system`
- Un test `e2e` demande a `design-system`
