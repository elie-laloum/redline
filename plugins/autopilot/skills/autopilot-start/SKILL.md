---
name: autopilot-start
description: Implemente un ticket Jira de bout en bout — cadrage et gate humain, TDD adversarial repo par repo dans l'ordre des dependances, capitalisation memoire, publication en un bloc. TRIGGER quand l'utilisateur donne une URL ou une cle de ticket Jira a implementer, ou tape /autopilot-start. NE PAS TRIGGER pour une question sur un ticket sans intention de l'implementer.
argument-hint: <url-ou-cle-jira> [--notes "…"] [--figma <url>…] [--live]
---

# autopilot-start

Tu pilotes le run. Tu ne codes pas, tu ne juges pas : tu invoques les agents dans l'ordre et
tu t'assures que l'etat est ecrit a chaque transition.

```
/autopilot-start <url-ou-cle-jira> [--notes "…"] [--figma <url>…] [--live]
```

`--figma` est **repetable** et **complementaire** : les maquettes sont d'abord cherchees dans
le ticket, et les URL de la ligne de commande **s'ajoutent** a ce qui a ete trouve. C'est le
cas courant — la maquette existe mais n'est pas toujours accrochee au ticket.

## Reprise

Avant tout : `get-ticket` avec la cle. Si `resumable` est vrai, **on reprend**, on ne repart
pas de zero. `run.phase`, `run.step` et `run.currentRepo` donnent le curseur exact, et
`scope[].status` dit ce qui est deja fait.

**Un run relance ne refait jamais un repo `done`.** Reprends a l'etape exacte ou le run
precedent s'est arrete.

## Avant le point 1

1. Si `--live` : `launch-live-mode`. C'est la toute premiere action, avant meme de lire le
   ticket.

   Ensuite, **tu pousses des events comme tout le monde** — et la numerotation en points de
   ce document ne sort jamais dans un `title`. Le shell affiche deja le libelle de l'etape a
   cote de ta phrase : « Point 2 — aucune maquette Figma rattachee » devient « Aucune maquette
   Figma rattachee au ticket ». Le reste de la regle est dans la description de
   `push-live-mode-event`.
2. `acquire-ticket-lock`. **Si le lock est deja pris, le run echoue immediatement** — deux
   runs sur le meme ticket se marcheraient dessus dans le meme worktree.
3. `write-store-ticket` pour poser `ticket.notes` (le `--notes`) et `figmaOverrides` (les
   `--figma`). Les conserver est ce qui fait qu'une reprise n'oublie pas ce qu'on a ajoute a
   la main.

Libere le lock a la fin du run, **y compris apres une escalade** : un lock oublie bloque la
reprise.

---

## Phase 1 — Cadrage (points 1 a 9)

Une seule fois pour tout le ticket. **Rien n'est ecrit nulle part en dehors de l'etat du
ticket** : aucun code, aucun remote, aucune memoire.

| # | Qui | Produit |
|---|---|---|
| 1 | tool `get-ticket` | le ticket — echec s'il n'existe pas ou n'est pas accessible |
| 2 | tool `get-figma-components` | les maquettes, celles du ticket **plus** celles du flag. **Optionnel** : sans maquette, le run continue |
| 3 | agent `doc-scout` | memoire pertinente, passe large |
| 4 | agent `functional-grill` | arbitrages fonctionnels, tours non bornes |
| 5 | agent `scope-scout` | repos impactes, ordonnes par `level`, avec preuves |
| 6 | agent `doc-scout` | memoire ciblee sur `repos/` et `integrations/` des repos retenus |
| 7 | agent `technical-grill` | arbitrages techniques, skills et rules des repos charges |
| 8 | agent `planner` | le plan + les deux checklists de sortie |
| 9 | **gate humain** | approbation |

Ecris l'etat apres chacun de ces points.

Le second passage du `doc-scout` n'est pas optionnel : sans lui, le `technical-grill` et le
`planner` travaillent sur une memoire non ciblee.

### Le point 9 est le seul gate humain du workflow

Soumets trois choses, et rien d'autre : **le scope, le plan repo par repo, les deux
checklists**. Utilise `ask-user`.

Trois issues :

- **approuver** → on passe en phase 2 ;
- **modifier** → le plan est amende et resoumis ;
- **rejeter** → retour au point 4 si le probleme est fonctionnel, au point 7 s'il est
  technique.

Une fois approuve, ecris `plan.approvedAt` — et **tout le reste s'execute sans nouvelle
validation**, y compris les actions publiques et irreversibles du point 13. Ne redemande
jamais confirmation apres ce point ; les seules interruptions restantes sont les escalades.

---

## Phase 2 — Implementation (point 10)

Le cycle est **rejoue integralement pour chaque repo du scope, dans l'ordre des `level`
croissants**, amont vers aval. **Un repo est termine avant qu'on ouvre le suivant.**

```
pour chaque repo du scope, par level croissant :
    10.1 -> 10.2 -> 10.3 -> 10.4 -> 10.5 -> 10.6 -> 10.7 -> repo suivant
```

Invoque l'agent `orchestrator` **une fois par repo**, avec le plan, les checklists et le nom
du repo. Il tient les compteurs, ecrit l'etat a chaque transition, et rend la main quand le
repo est `done` ou `escalated`.

**Si une escalade remonte, le run s'arrete la.** On ne passe pas au repo suivant, on ne
publie rien.

> Si l'invocation d'agents depuis l'`orchestrator` n'est pas disponible dans
> l'environnement, applique toi-meme les regles de routage : elles sont ecrites en entier
> dans `agents/orchestrator.md`, et l'`orchestrator` reste alors l'agent qui tient l'etat et
> les compteurs.

---

## Phase 3 — Capitalisation et publication (points 11 a 13)

Une seule fois, quand **tous** les repos du scope sont passes.

| # | Agent | Produit |
|---|---|---|
| 11 | `memory-planner` | le plan memoire — **les contradictions d'abord** |
| 12 | `memory-writer` | les fichiers memoire + un commit unique `memory: <ticket-id>` |
| 13 | `finalizer` | une MR par repo cross-referencees, un canal slack, une transition Jira, un commentaire |

Il n'y a **pas** de gate humain aux points 11 et 12. « Valide » veut dire revocable : le
commit unique se relit et se `revert`.

---

## Les trois compteurs

La v2 a le droit d'etre plus lente que la v1 si elle est plus rigoureuse. On la juge sur
`metrics` dans l'etat du ticket :

- **`mrFeedbackCount`** — indicateur principal, il mesure l'effet de l'incrementation de la
  memoire. Il reste a `null` : c'est l'utilisateur qui le renseigne a la main tant que le workflow 2
  n'existe pas.
- **`humanInterventions`** — gate, escalades, reponses a `ask-user`. Les tools l'incrementent
  seuls.
- **`loopTurnsTotal`** — somme des compteurs `scope[].loops`. Mets-le a jour en fin de run.

---

## En cas d'echec en cours de route

Le dechet est assume, et il est borne :

- les commits du `developer` restent dans le worktree ;
- les tags deja pousses restent en place ;
- les versions de dev deja publiees ne sont pas nettoyees.

**Rien d'autre n'a ete publie** : ni MR, ni canal, ni transition. Relancer `/autopilot-start`
reprend ou ca s'est arrete.

Dis-le explicitement a l'utilisateur quand tu rends la main sur une escalade : ce qui existe, ou, et
ce qu'il reste a faire.
