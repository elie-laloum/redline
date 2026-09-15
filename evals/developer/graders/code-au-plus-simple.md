---
type: llm
weight: 1
---

# Le code repond-il au plus simple ?

## Reussite
- La periode est transmise quand elle est la, et le query param est absent sinon
- La validation precede l'appel reseau
- Aucune abstraction, option de configuration ou couche de compatibilite que rien ne demande

## Echec
- Un systeme de validateurs enfichables pour un seul format
- Un cache, un retry ou un logger que ni le plan ni les tests ne reclament
