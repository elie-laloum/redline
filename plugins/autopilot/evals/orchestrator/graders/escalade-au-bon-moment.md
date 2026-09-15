---
type: llm
weight: 1
---

# Escalade-t-il quand le budget tombe, et seulement la ?

## Reussite
- **A** : escalade. Le budget `codeAdversary` de 3 est atteint, on ne relance pas un tour
- L'escalade est explicitement `escalate-to-human`, pas « je livre en l'etat » ni « je
  corrige moi-meme »

## Echec
- Un quatrieme tour lance
- Une MR proposee « avec les reserves du reviewer »
- Une escalade declenchee sur B, C ou D, ou aucun budget n'est atteint
