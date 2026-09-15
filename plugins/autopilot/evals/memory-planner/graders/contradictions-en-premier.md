---
type: llm
weight: 1
---

# Traite-t-il les contradictions avant toute creation ?

Corriger une note fausse prime sur en ajouter une vraie : une note fausse est lue, suivie, et
coute un aller-retour a chaque agent qui tombe dessus.

## Reussite
- Les deux contradictions apparaissent en tete du plan, avant les creations
- Chacune recoit une decision explicite : corriger, reecrire, supprimer, ou garder en
  expliquant pourquoi
- `conventions-tests.md` passe a rstest ; `endpoints.md` mentionne desormais `period`
- `last_verified` est mis a jour sur les notes touchees

## Echec
- Les creations d'abord, les contradictions en fin de plan ou absentes
- Une contradiction traitee par l'ajout d'une note qui dit le contraire, sans corriger
  l'ancienne
