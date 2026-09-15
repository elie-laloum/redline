---
type: llm
weight: 1
---

# Trouve-t-il les trois defauts plantes ?

## Reussite
- Ligne 5 : assertion faible. On verifie que `get` a ete appele, jamais **avec quoi** — `T1`
  ne peut pas passer
- Ligne 16 : `toBeDefined()` sur un cas qui doit **lever**. Le test passerait meme si rien
  n'etait leve, et il ne verifie pas l'absence d'appel reseau — `T3` ne passe pas
- Ligne 1 : `http` est un mock complet, le chemin reel n'est jamais appele

## Echec
- Une des trois lignes non relevee
- Un verdict global « les tests sont insuffisants » sans pointer les lignes
