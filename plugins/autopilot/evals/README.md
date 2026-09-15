# Evals — la qualite de jugement des agents

Une suite par agent, pour les quinze. Chacune plante **volontairement un defaut** : un test qui
passe pour une mauvaise raison, un critere d'acceptation non couvert, une note de memoire
perimee, une regression sur un appelant. Un eval d'agent adverse qui ne contient que du code
sain ne prouve rien.

## Ce que ce niveau repond, et ce qu'il ne repond pas

| Niveau | Dossier | Question |
|---|---|---|
| Evals | `evals/` | est-ce que cet **agent** juge bien ? |
| Tests unitaires | `tests/unit/` | est-ce que cette **fonction** est correcte ? |
| Tests de workflow | `tests/workflow/` | est-ce que **l'enchainement** tient de bout en bout ? |

Un workflow peut s'enchainer parfaitement avec un plan mediocre. C'est pour ca que les trois
niveaux coexistent et qu'aucun ne remplace les autres.

## Lancer

```
pnpm eval
```

soit, en clair :

```
claude plugin eval ./plugins/autopilot --ablation with-without --mocks record \
  --allow-real-servers --allow-tools 'mcp__plugin_autopilot_autopilot__*' --runs 3
```

Les quatre reglages ne sont pas negociables :

- **`--ablation with-without`** — systematiquement. C'est la seule facon de savoir si l'agent
  apporte quelque chose, ou si Claude ferait aussi bien sans lui. Un cas dont l'ecart est nul
  signale un agent a reecrire, pas un succes.
- **`--allow-real-servers`** — sans lui, le serveur `autopilot` ne demarre pas et chaque
  agent part avec zero tool, ce qui fait refuser le spawn. Le perimetre reste borne par
  l'`allowed_tools` de chaque cas, qui ne liste que des tools en lecture. Voir `mocks/README.md`.
- **`--runs 3`** minimum — une sortie d'agent varie, on ne teste pas une egalite, on **note**
  et on regarde la tendance.
- **`--threshold`** pour bloquer sur regression.

Filtrer sur un agent : ajouter `--case doc-scout`.

## Ce que chaque suite doit prouver

| Agent | Ce que l'eval verifie |
|---|---|
| `doc-scout` | ramene les notes pertinentes, respecte ses budgets (15 fichiers, 200 lignes), cite les chemins, dit ce que la memoire ignore |
| `functional-grill` | detecte la contradiction plantee entre ticket et maquette, pose la bonne question, ne conclut pas sur une hypothese |
| `scope-scout` | retrouve les repos reellement impactes avec preuves, n'en invente pas sur des mots-cles, remonte toute la chaine |
| `technical-grill` | charge le skill du repo et ne redemande pas ce qu'il dit deja, cible les vraies ambiguites, anticipe la publication amont |
| `planner` | plan ordonne par `level`, checklists derivees des criteres d'acceptation, lignes observables |
| `orchestrator` | route correctement, distingue un test ajoute d'un test corrige, escalade au bon moment, respecte l'ordre de 10.7 |
| `test-writer` | couvre la checklist, n'introduit pas un type de test absent du repo, ne sort pas de sa zone |
| `test-adversary` | trouve l'assertion faible et le mock qui se teste lui-meme, **et** n'attaque pas le test sain |
| `red-checker` | distingue un rouge d'assertion d'un rouge de compilation ou d'import, attrape le test vert avant implementation |
| `developer` | implemente au plus simple, ne touche aucun fichier de test, utilise les bons canaux de recours |
| `green-checker` | interprete un echec au lieu de le recopier, distingue une panne d'environnement d'un bug |
| `code-adversary` | trouve la regression plantee sur les appelants, cite `fichier:ligne`, ne bloque pas sur du hors-scope |
| `memory-planner` | traite les contradictions en premier, fusionne au lieu d'empiler, classe au bon niveau |
| `memory-writer` | applique a la lettre, remonte les refus au lieu de les contourner, un seul commit |
| `finalizer` | N MR cross-referencees, respecte l'allowlist sur une squad inconnue, utilise `writer-voice-tone` |

## Les deux sens comptent

Pour les deux adversaires en particulier : **un agent qui refuse tout est aussi casse qu'un
agent qui accepte tout**. Chaque suite adverse contient donc du materiel sain, et un grader
verifie qu'il n'est pas rejete.
