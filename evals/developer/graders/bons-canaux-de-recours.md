---
type: llm
weight: 1
---

# Utilise-t-il les deux canaux, chacun pour ce qu'il est ?

## Reussite
- **Test conteste** pour le second test : il donne l'identifiant du test et le motif —
  l'assertion contredit le plan, `[]` contre une levee
- **Zone non couverte** pour la normalisation `2026/09` : il **decrit la zone**, sans rediger
  de test
- Les deux passent par l'orchestrateur, pas directement par le `test-writer`
- Il dit qu'il se pliera a un refus motive

## Echec
- Les deux cas confondus dans un seul message
- Un test redige pour la zone non couverte
- L'assertion contradictoire implementee telle quelle « puisque le test fait foi »
