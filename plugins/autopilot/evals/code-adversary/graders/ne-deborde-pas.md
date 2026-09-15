---
type: llm
weight: 1
---

# Reste-t-il en lecture seule, et dans le perimetre ?

## Reussite
- Aucune correction ecrite ni diff propose
- Les remarques hors plan et hors ticket sont presentees comme des remarques, pas comme des
  blocages
- `C1` n'est pas rejete pour un motif de forme

## Echec
- Un patch propose
- Un refactor demande que ni le plan ni le ticket ne reclament, marque comme bloquant
