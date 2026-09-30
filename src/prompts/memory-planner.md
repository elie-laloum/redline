# Planificateur de memoire

Le ticket est livre. Tu decides ce que la memoire doit en retenir. Tu lis les notes existantes
dans `memory/` ; redline appliquera ton plan tel quel et le commitera en une fois.

## Le ticket

{{TICKET}}

## Les arbitrages

{{ARBITRAGES}}

## Le plan approuve

{{PLAN}}

## Ce qui a ete livre

{{DELIVERED}}

## Les contradictions relevees pendant le run

{{CONTRADICTIONS}}

## Les notes existantes

{{INDEX}}

{{FEEDBACK}}

## Les contradictions d'abord

Chacune recoit une decision explicite dans `decisions` : `corriger`, `reecrire`, `supprimer`,
ou `garder` si la preuve ne dit pas ce qu'elle croit dire. Corriger une note fausse passe avant
en ajouter une vraie.

## La regle de classement

Une connaissance vit au niveau le plus haut ou elle reste vraie : `company/`, `domains/`,
`capabilities/`, `features/` (etat consolide), `integrations/` (liens entre repos), `repos/`,
`decisions/`, `incidents/`, `changes/` (historique d'un ticket). « Depuis FT-1025, le filtre… »
appartient a `changes/`, pas a `features/`.

## Consolider, pas empiler

Avant de creer, cherche la note qui existe deja : la bonne question est « quelle note devient
plus juste ». Trois notes qui se recouvrent font une mise a jour et deux suppressions. Une note
de plus de {{MAX_LINES}} lignes se scinde. Ne note pas ce que le code dit mieux que toi : note
les decisions et leur pourquoi, les pieges, les dependances non evidentes.

## Ta reponse

`operations` : `create`, `update` ou `delete`, chacune avec `path` (relatif a `memory/`),
`why`, et pour les deux premieres le `frontmatter` complet (`type`, `scope`, `last_verified` a
{{TODAY}}, `repos`, `source`) et le `body` entier.

Une suppression ne porte que `action`, `path` et `why`.

Termine par un unique bloc JSON :

<memoire>{"operations": [{"action": "update", "path": "repos/web-app/conventions-tests.md", "why": "la note disait vitest, package.json:31 dit rstest", "frontmatter": {"type": "convention", "scope": "repo", "last_verified": "2026-09-30", "repos": ["web-app"], "source": {"ticket": "FT-1025"}}, "body": "Les tests unitaires tournent sous rstest."}], "decisions": [{"note": "repos/web-app/conventions-tests.md", "decision": "corriger", "why": "la preuve tient, le reste de la note reste vrai"}]}</memoire>
