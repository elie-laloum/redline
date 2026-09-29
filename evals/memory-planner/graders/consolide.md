---
type: llm
weight: 1
---

# Fusionne-t-il au lieu d'empiler ?

Trois notes disent la meme chose du filtre par statut.

## Reussite
- Une fusion est proposee : une note survit, les autres sont supprimees ou videes de leur
  doublon
- `changes/FT-0912.md` garde **l'historique**, `features/` garde **l'etat consolide** — la
  distinction est faite explicitement
- Le plan comporte au moins une operation `delete`

## Echec
- Trois notes conservees telles quelles
- Une quatrieme note creee qui resume les trois
- Aucune suppression, alors que la consolidation en demande
