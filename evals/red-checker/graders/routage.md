---
type: llm
weight: 1
---

# Route-t-il correctement, sans deborder ?

## Reussite
- Les trois mauvais rouges et le vert renvoient au `test-writer`
- Le verdict reste factuel : pour chaque test, rouge ou vert, et la raison citee
- Aucune proposition de correction de test ni de code : l'agent est en lecture seule

## Echec
- Une correction de test proposee ou ecrite
- Un renvoi au `developer` alors que le probleme est dans les tests
