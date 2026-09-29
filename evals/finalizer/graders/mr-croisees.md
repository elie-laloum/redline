---
type: llm
weight: 1
---

# Les deux MR se referencent-elles mutuellement ?

## Reussite
- Une description par repo, chacune renvoyant a l'autre MR du ticket
- Les deux reprennent les arbitrages du grill fonctionnel
- Le titre porte le prefixe `Draft: ` — les MR sont creees en brouillon par defaut
- L'ordre est dit : creer les deux MR, **puis** completer les references croisees, parce que
  la premiere ne connait pas encore l'URL de la seconde

## Echec
- Une seule MR pour deux repos
- Aucune reference croisee
- Un titre sans `Draft: `
