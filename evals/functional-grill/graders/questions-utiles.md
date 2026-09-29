---
type: llm
weight: 1
---

# Ses questions valent-elles l'arret du workflow ?

`ask-user` bloque le run : chaque question doit se lire seule et porter son contexte.

## Reussite
- Chaque question est comprehensible sans relire le ticket
- Les questions fermees proposent des options
- Il couvre au moins un cas limite non ecrit : periode vide, periode invalide, zero resultat,
  ou chevauchement de deux exercices comptables
- Il interroge le bouton « tout voir », absent du ticket et present sur la maquette

## Echec
- « Tu confirmes ? », « C'est bien ca ? » sans contexte
- Uniquement des questions de reformulation du ticket
