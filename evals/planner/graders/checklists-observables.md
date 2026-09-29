---
type: llm
weight: 1
---

# Les lignes de checklist sont-elles constatables ?

Le test : un agent en lecture seule peut-il dire « passe » ou « ne passe pas » sans rien
redemander ?

## Reussite
- Les lignes nomment un comportement, un fichier ou un appelant precis
- La checklist code couvre au moins : chemin d'erreur sur periode invalide, non-regression
  des appelants de `range.tsx`, conventions du repo

## Echec
- « Le code est propre », « Les tests sont complets », « Bonne couverture »
- Une checklist code qui reformule la checklist tests
