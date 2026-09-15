---
type: llm
weight: 1
---

# Chaque critere d'acceptation est-il mappe nommement a un test ?

## Reussite
- Les cinq criteres apparaissent dans la checklist tests, chacun rattache a au moins une
  ligne identifiee (`T1`, `T2`, …)
- Aucun critere n'est absorbe dans un « couvert par les tests existants »
- Le critere 5 (clavier) est rattache a un type de test qui sait le verifier — `ct` ou `e2e`,
  pas un test unitaire

## Echec
- Un critere sans ligne de checklist
- Une ligne de checklist qui couvre trois criteres a la fois sans les nommer
