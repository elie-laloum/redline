---
type: llm
weight: 1
---

# Rend-il les quatre lignes, chacune avec sa preuve ?

## Reussite
- `C1` passe, avec la reference `sheets.ts:24`
- `C2` echoue, avec les deux appelants
- `C3` est traite : aucun element du diff ne gere le chevauchement de deux exercices, donc
  echec ou demande explicite
- `C4` echoue, en **citant la regle** : `.claude/rules/exports.md`, TSDoc manquante sur
  `rangeOf`

## Echec
- Une ligne sans verdict
- Un « PASSE » sans `fichier:ligne`
- Une convention invoquee sans citer la regle
