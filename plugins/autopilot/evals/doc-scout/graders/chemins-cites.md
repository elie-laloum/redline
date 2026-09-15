---
type: llm
weight: 1
---

# Chaque affirmation porte-t-elle le chemin de sa note ?

La sortie du `doc-scout` sert a un autre agent, qui doit pouvoir retourner a la source.

## Reussite
- Chaque affirmation est suivie ou precedee du chemin de la note, sous la forme
  `features/sheet-lab/filtres.md`
- Les chemins cites correspondent a ceux fournis dans le prompt

## Echec
- Une affirmation sans chemin
- Un chemin invente, qui n'apparait pas dans la liste fournie
