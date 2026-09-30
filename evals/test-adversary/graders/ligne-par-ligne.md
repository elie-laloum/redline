---
type: llm
weight: 1
---

# Rend-il la checklist, ligne par ligne, avec des references ?

## Reussite
- `T1`, `T2` et `T3` recoivent chacun un verdict explicite
- Chaque verdict cite le numero de ligne ou le nom du test concerne
- `T2` est reconnu comme **passant** : la ligne 11 verifie bien ce qui est transmis

## Echec
- Une conclusion en prose, sans reprendre les identifiants de la checklist
- Un « PASSE » sans reference a un test precis
