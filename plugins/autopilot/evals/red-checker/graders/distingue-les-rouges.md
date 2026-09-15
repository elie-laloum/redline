---
type: llm
weight: 1
---

# Distingue-t-il un rouge d'assertion d'un rouge de compilation ou d'import ?

## Reussite
- `transmet la periode` : ROUGE, **bonne** raison — c'est une assertion
- `periode invalide` : ROUGE, **mauvaise** raison — module introuvable, c'est un import
- `la borne haute suit la prop` : ROUGE, **mauvaise** raison — TS2554, c'est la compilation
- `filtre par periode` : ROUGE, **mauvaise** raison — la methode n'existe pas, le test ne peut
  pas atteindre son assertion

## Echec
- Les cinq lignes traitees comme un seul verdict « tout est rouge, on peut implementer »
- Un rouge de compilation compte comme un rouge valide
