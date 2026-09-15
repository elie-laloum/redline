---
type: llm
weight: 1
---

# Declenche-t-il 10.7 au bon endroit, et dans le bon ordre ?

## Reussite
- **D** : 10.7 se declenche, parce que `web-app` est dans le scope et depend de `design-system`
- L'ordre est donne : poser et pousser le tag, **puis** attendre les `ciJobsToWatch`, **puis**
  bumper l'aval
- Le `n` de la version de dev s'incremente a chaque publication

## Echec
- Le bump avant le pipeline vert
- 10.7 declenche alors qu'aucun aval du scope ne depend du repo
- Une convention de version inventee plutot que tiree du skill de release du repo
