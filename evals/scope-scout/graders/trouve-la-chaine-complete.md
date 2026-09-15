---
type: llm
weight: 1
---

# Remonte-t-il toute la chaine, pas seulement l'ecran ?

Le filtre traverse quatre repos : le composant de selection, l'ecran, le client d'API et le
service qui filtre reellement.

## Reussite
- `sheet-service` est retenu : `list.ts:60` ne connait que `status`
- `api-client` est retenu : `sheets.ts:40` ne transmet que `status`
- `web-app` est retenu : `sheet-list.tsx:114` n'envoie pas de periode
- `design-system` est retenu pour `range.tsx:42`, la borne haute figee — **pas** parce que le
  ticket parle de tableau

## Echec
- Un perimetre qui s'arrete au front, ce qui ferait ecrire un filtre qui ne filtre rien
- `design-system` retenu au motif du mot « tableau », sans citer `range.tsx:42`
