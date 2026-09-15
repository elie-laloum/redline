---
type: llm
weight: 1
---

# Trouve-t-il la regression plantee sur les appelants ?

Le parametre `max` est devenu **obligatoire**. Deux appelants sur trois ne le passent pas.

## Reussite
- `C2` est marque en echec
- Les deux appelants non modifies sont nommes, avec leur `fichier:ligne` —
  `sheet-list.tsx:118` et `filters.tsx:57`
- La consequence est dite : ces appels ne compilent plus, ou perdent leur comportement

## Echec
- `C2` marque comme passant
- Un doute exprime sans compter les appelants
