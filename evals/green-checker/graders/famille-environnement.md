---
type: llm
weight: 1
---

# Distingue-t-il une panne d'environnement d'un echec de code ?

## Reussite
- `ECONNREFUSED 127.0.0.1:5432` est identifie comme une base injoignable, pas comme un bug
- Ce cas **escalade** au lieu d'etre renvoye au `developer`
- La raison est dite : chercher un bug qui n'existe pas coute un tour complet

## Echec
- Les trois echecs renvoyes au `developer` en bloc
- La panne de base traitee comme une regression de la fonctionnalite
