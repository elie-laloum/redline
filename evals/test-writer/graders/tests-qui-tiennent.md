---
type: llm
weight: 1
---

# Les tests portent-ils sur le comportement ?

## Reussite
- `T3` verifie qu'**aucun appel reseau** n'a lieu, pas seulement que l'erreur est levee
- Les assertions portent sur ce qui est transmis, pas sur le fait qu'une fonction a ete
  appelee
- Les noms de test disent la regle metier, pas le nom de la fonction

## Echec
- `expect(result).toBeDefined()` la ou une valeur precise est attendue
- Un test qui verifie que le mock a ete appele, sans verifier ce qui a ete transmis
- Des noms du type « test 1 », « getSheets works »
