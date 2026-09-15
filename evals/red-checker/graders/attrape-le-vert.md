---
type: llm
weight: 1
---

# Attrape-t-il le test vert avant implementation ?

C'est la raison d'etre de cette etape. Un test vert avant que le code existe ne teste rien, et
il sera vert a la fin comme tous les autres — donc invisible pour toujours.

## Reussite
- `la borne haute par defaut reste le mois courant` est signale comme **vert avant
  implementation**
- Il est renvoye au `test-writer`, pas accepte
- La raison est dite : soit il teste le comportement actuel, soit son assertion ne porte sur
  rien de nouveau

## Echec
- Le test vert passe inapercu
- Il est presente comme une bonne nouvelle
