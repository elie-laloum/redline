# autopilot v2

Implemente un ticket Jira de bout en bout : cadrage et gate humain, TDD adversarial repo par
repo dans l'ordre des dependances, capitalisation memoire, puis publication en un seul bloc.

```
/autopilot-start <url-ou-cle-jira> [--notes "…"] [--figma <url>…] [--live]
```

Sur un ticket qui a deja un fichier d'etat, la commande **reprend** au lieu de repartir de
zero.

## Les trois idees qui portent le reste

**Toute action faite a chaque run de facon constante est un tool, pas une instruction
d'agent.** Un tool est deterministe, testable, et ne consomme pas de contexte. C'est pour ca
qu'il y en a 56 et que la majorite de la surface se teste sans LLM.

**Un agent ne peut ecrire que dans une seule zone.** Le `test-writer` ecrit les tests, le
`developer` le code et jamais un test, les deux adversaires rien, le `memory-writer` est seul
dans `memory/`, le `finalizer` seul sur un remote. Un agent qui aurait besoin de deux zones
serait mal decoupe.

**Contredire la memoire est une sortie autorisee.** Les scouts et le `developer` disposent de
`contradict-memory` quand ce qu'ils lisent ne correspond pas au code reel. C'est le mecanisme
qui empeche la base de pourrir.

## La boucle

Trois phases. Le **cadrage** (1→9) tourne une fois et n'ecrit rien en dehors de l'etat du
ticket. L'**implementation** (10) est rejouee pour chaque repo, par `level` croissant, un repo
termine avant d'ouvrir le suivant. La **capitalisation et la publication** (11→13) tournent
une fois a la fin.

| # | Acteur | Produit |
|---|---|---|
| 1-2 | tools | le ticket, les maquettes (optionnelles) |
| 3 | `doc-scout` | memoire pertinente, passe large |
| 4 | `functional-grill` | arbitrages fonctionnels, tours non bornes |
| 5 | `scope-scout` | repos impactes, avec preuves |
| 6 | `doc-scout` | memoire ciblee sur les repos retenus |
| 7 | `technical-grill` | arbitrages techniques |
| 8 | `planner` | le plan et les deux checklists de sortie |
| 9 | **gate humain** | **le seul du workflow** |
| 10.1→10.7 | `test-writer` → `test-adversary` → `red-checker` → `developer` → `green-checker` → `code-adversary` → publication amont | par repo |
| 11-12 | `memory-planner`, `memory-writer` | le plan memoire, un commit unique |
| 13 | `finalizer` | N MR cross-referencees, un canal, une transition |

Une fois le point 9 approuve, tout le reste s'execute sans nouvelle validation, y compris les
actions publiques et irreversibles du point 13. Les seules interruptions ensuite sont les
escalades.

**10.3 existe pour une seule raison** : c'est le seul garde-fou contre le test qui passe pour
de mauvaises raisons. Ces tests-la sont verts a la fin, donc invisibles pour toujours.

## Ou vivent les choses

**Le projet porte le code et la configuration** — il se clone, il se relit, il se revoit.

```
autopilot/
├── autopilot.yaml        budgets, timeouts, nommage, allowlist slack, transitions jira
├── repositories.yaml     le registre : level, commandes, jobs de ci, dependances
├── .env                  les PAT — gitignore depuis le premier commit
├── plugins/autopilot/    les 15 agents, la skill, les regles de voix, le serveur de tools
│   └── evals/            une suite d'eval par agent
├── tools/live-shell/     l'app du mode live, tanstack start en ssr
└── tests/                unit/, workflow/, fixtures/
```

**`~/.autopilot` porte la connaissance et l'etat** — il ne se clone pas, il s'accumule.

```
~/.autopilot/
├── memory/                       la base de connaissance, versionnee
├── tickets/<ticket-id>.yaml      l'etat de suivi, versionne
├── events/<ticket-id>.jsonl      le flux du live mode, jetable
├── locks/<ticket-id>             le lock de run, jetable
└── worktrees/<ticket-id>/<repo>/ les worktrees, jetables
```

C'est un depot git, mais **tout y est gitignore sauf `memory/` et `tickets/`** : est versionne
ce qui a de la valeur apres le run.

## Installer

```
pnpm install
cp .env.example .env     # puis remplir les jetons
pnpm config:check
```

Le plugin se declare comme marketplace locale pointant sur ce dossier. Le serveur de tools
tourne en TypeScript natif, sans etape de build — Node 22.18 ou plus.

## Verifier

| Commande | Ce qu'elle repond |
|---|---|
| `pnpm test` | est-ce que cette **fonction** est correcte ? 115 tests |
| `pnpm test:workflow` | est-ce que **l'enchainement** tient de bout en bout ? 12 scenarios en sandbox |
| `pnpm eval` | est-ce que cet **agent** juge bien ? une suite par agent |
| `pnpm typecheck` | — |

Il n'y a **pas** de `--dry-run` dans autopilot : la sandbox de `tests/workflow/` le remplace,
et elle le remplace mieux. Un flag se contourne et ne verifie rien ; une sandbox verifie ce
qui s'est reellement passe. Git n'y est d'ailleurs pas mocke — les faux repos sont de vrais
depots avec un remote bare.

## Mesurer

Trois compteurs, dans `metrics` du fichier de suivi :

- **`mrFeedbackCount`** — l'indicateur principal, il mesure l'effet de l'incrementation de la
  memoire. Renseigne **a la main** tant que le workflow 2 n'existe pas.
- **`humanInterventions`** — gate, escalades, reponses a `ask-user`.
- **`loopTurnsTotal`** — la somme des compteurs de boucle.

La v2 a le droit d'etre plus lente que la v1 si elle est plus rigoureuse.

## Hors scope, assume

Le **workflow 2** — collecte des retours Slack, Jira, threads de MR et CI, traitement sur la
meme branche, archivage — n'existe pas en v2. D'ici la, les retours de MR se traitent a la
main. Les champs `workflow2` du fichier de suivi et le bloc `jira.workflow2` d'`autopilot.yaml`
sont deja la : le jour ou on le branche, aucun ticket deja traite n'aura besoin d'etre migre.

Pas d'**index semantique** non plus. La recherche memoire est un filtre deterministe sur le
frontmatter plus un grep : exact, gratuit, debuggable, jamais desynchronise. On ajoutera un
index quand la recherche deterministe ne suffira plus.

## Un ecart assume sur l'emplacement des evals

La note place `evals/` a la racine du projet. `claude plugin eval` ne sait resoudre son
dossier de cas que **sous le plugin**, et cibler le plugin par son nom le fait tourner sur la
copie installee en cache, pas sur l'arbre de travail — donc sans voir les prompts d'agent
qu'on vient de modifier.

Les suites vivent donc dans `plugins/autopilot/evals/`, declarees par
`experimental.evals` du manifeste. C'est le seul emplacement ou `pnpm eval` evalue le code
qu'on a sous les yeux.

## Un ecart assume sur les depots de fixture

La note place les faux depots dans `tests/fixtures/repos/`. Un depot git **dans** un depot git
est un `.git` imbrique, que git ne suit pas sans sous-module ni renommage restaure au
lancement — c'est-a-dire un generateur, en moins lisible.

Ils sont donc decrits dans `tests/fixtures/repos.ts` et materialises a l'execution, dans un
dossier temporaire par cas : quatre vrais depots, avec un vrai remote **bare**, des `level`
differents, une dependance amont/aval, un monorepo, et une suite qu'on peut faire echouer a
la demande. Chaque test repart d'un depot neuf, sans heriter du tag qu'un test precedent a
pousse.

Pour les ouvrir a la main :

```
pnpm fixtures          # les ecrit dans tests/.fixtures/, gitignore
```
