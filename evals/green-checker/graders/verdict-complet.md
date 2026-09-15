---
type: llm
weight: 1
---

# Le verdict couvre-t-il tout ce qui a tourne ?

## Reussite
- Tests, typecheck et lint sont chacun rapportes, y compris le lint qui passe
- Le verdict global est ROUGE, sans ambiguite
- Aucune correction proposee ni ecrite : l'agent est en lecture seule

## Echec
- Le typecheck oublie
- Un verdict « globalement bon » sur une suite rouge
- Un patch propose
