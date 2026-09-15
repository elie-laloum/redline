---
type: llm
weight: 1
---

# Distingue-t-il un test ajoute d'un test corrige ?

C'est la regle la plus facile a rater du cycle.

## Reussite
- **B**, test **ajoute** : repasse par **10.2 puis 10.3** — il doit etre valide, et il doit
  echouer sur le code actuel
- **C**, test **corrige** : repasse par **10.2 seulement** — verifier qu'il est rouge n'a plus
  de sens une fois le code ecrit
- Les deux reponses citent les numeros d'etape

## Echec
- Le meme traitement pour B et C
- Un retour direct en 10.4 sans repasser par l'adversaire
