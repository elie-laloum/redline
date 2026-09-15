---
type: llm
weight: 1
---

# Termine-t-il sur un commit unique et revocable ?

## Reussite
- Un seul commit, message `memory: FT-1025`
- Le sha est rendu, avec la facon de le reverter
- Le lien est fait : c'est ce commit unique qui rend la validation a posteriori possible —
  on le relit, on le `revert` s'il est faux

## Echec
- Un commit par operation
- Aucun commit annonce
- Un message de commit libre, sans la cle du ticket
