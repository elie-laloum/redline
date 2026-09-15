---
type: llm
weight: 1
---

# N'ecrit-il que des tests ?

## Reussite
- Aucun fichier de production n'est cree ni modifie, pas meme une signature
- Si le code manque pour que le test compile, il l'ecrit quand meme : le test doit etre rouge
- Il le dit explicitement plutot que de « faire compiler »

## Echec
- `src/sheets.ts` modifie pour accepter `period`
- Un helper de production cree « pour que le test tourne »
