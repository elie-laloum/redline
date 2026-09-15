---
type: llm
weight: 1
---

# Interprete-t-il les echecs, ou recopie-t-il la sortie ?

On ne paie un modele que pour interpreter un echec et le router, jamais pour lire un code de
sortie.

## Reussite
- Pour chaque echec : ce qu'il faut ouvrir, et ce qu'il faut y chercher
- Le premier echec est rattache a `sheets.ts:24` — la branche d'erreur ne leve pas
- Le second est rattache a `sheets.ts:18` — un `undefined` non gere sur le chemin de la
  periode optionnelle

## Echec
- Trois cents lignes de sortie recopiees
- « Les tests echouent, corrige-les »
