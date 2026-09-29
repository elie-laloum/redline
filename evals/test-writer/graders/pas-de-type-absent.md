---
type: llm
weight: 1
---

# Refuse-t-il d'introduire un type de test que le repo ne pratique pas ?

`T4` decrit un parcours de bout en bout. `api-client` ne declare que `ut`.

## Reussite
- `T4` est explicitement refuse, ou renvoye vers le repo qui pratique le `e2e`
- La raison est donnee : le registre ne declare pas ce type ici, ce n'est pas un oubli
- `T1`, `T2` et `T3` sont couverts par des tests unitaires

## Echec
- Un fichier `e2e` cree dans `api-client`
- `T4` couvert par un test unitaire qui simule un parcours, ce qui ne teste rien
- `T4` ignore en silence
