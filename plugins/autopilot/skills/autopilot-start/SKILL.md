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

**`run.step` s'ecrit en ENTRANT dans le point, le reste de l'etat en sortant.**

C'est la seule chose qui rend l'etape affichable pendant qu'elle dure. Ecrit apres coup, il
dit « Lecture du ticket » pendant que le `functional-grill` interroge depuis trois minutes —
et un curseur qui retarde d'un point entier est aussi faux qu'un curseur absent, avec en plus
l'air d'etre juste.

Donc, pour chaque point, dans cet ordre :

1. `write-store-ticket` avec `run.step` — **avant** d'invoquer. Le numero du point
   et rien d'autre : `4`, ou `10.4` pour une sous-etape du cycle. Pas `"4 -
   functional-grill"`, pas `"Point 4"` : c'est un curseur de reprise, il se
   compare. Ce que fait l'etape se dit dans le `title` de ton event ;
2. `push-live-mode-event` avec `kind: "step"`, `status: "start"` et ce que le point va faire ;
3. le point ;
4. `push-live-mode-event` avec `kind: "step"`, `status: "progress"` — **des que l'agent t'a
   rendu la main**, avant meme d'ecrire l'etat ;
5. `write-store-ticket` avec ce qu'il a produit.

Le 2 n'est pas un doublon du 1. Le 1 rend la reprise possible, le 2 date l'etape : c'est de
lui que vient la duree affichee, et sans lui une etape de vingt minutes n'a pas d'age.

**Ne remplis JAMAIS `agent` sur tes events.** Tu n'es pas un agent, tu es le workflow — le
champ `agent` sert a dire quel sous-agent tient la main, et toi tu la reprends. Y ecrire
`autopilot-start`, et a plus forte raison `autopilot-start (gate humain, point 9)`, cree un
agent fantome qui s'affiche dans le rail **a la place de l'`orchestrator` qui tourne
vraiment**, avec le loader, sous une etape qui n'est pas la sienne. Ce que tu fais se dit dans
`title` ; l'etape, elle, est deja affichee a cote.

**Le 4 n'est pas une politesse.** C'est justement ce champ vide qui dit que tu as repris la
main : tant que le dernier event du flux porte un nom d'agent, le shell considere que cet
agent travaille toujours — il n'a aucun autre moyen de le savoir. Sans le 4,
le `functional-grill` garde le loader pendant que tu ecris l'etat, et il ne passe au vert que
quand le point suivant s'ouvre. Le 4 rend la main a l'etape, visiblement, au moment ou elle
est rendue pour de vrai.

Le second passage du `doc-scout` n'est pas optionnel : sans lui, le `technical-grill` et le
`planner` travaillent sur une memoire non ciblee.

### Le point 9 est le seul gate humain du workflow

`ask-plan-approval`, avec `plan.repos` tel que le planner l'a ecrit. **Pas `ask-user`** : un
plan se lit sur une page, pas dans un formulaire de cinq questions dont on a oublie la
premiere en repondant a la derniere.

Ne soumets **que le plan**. Le perimetre et les deux checklists ont leurs propres vues et se
lisent a cote ; les recopier dans le gate ferait lire deux fois la meme chose a quelqu'un
qui doit deja en tenir trois.

Trois issues, rendues par le tool :

- **`approve`** → on passe en phase 2. Le tool a deja ecrit `plan.approvedAt` ;
- **`amend`** → la note dit quoi changer : renvoie le `planner` dessus, puis resoumets ;
- **`reject`** → retour au point 4 si le probleme est fonctionnel, au point 7 s'il est
  technique. La note le dit.

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

L'orchestrateur passe par `preflight-repo` avant d'ouvrir 10.1. Une panne d'environnement
detectee la coute trente secondes ; la meme panne decouverte en 10.3 arrive deguisee en
echec de test, traverse le `developer`, et il faut un humain pour trancher que personne
n'avait tort.

**Si une escalade remonte, le run s'arrete la.** On ne passe pas au repo suivant, on ne
publie rien.

### Tu ne lances jamais un test toi-meme

Tu as un shell, les agents de test n'en ont pas. C'est exactement pour ca que tu ne dois pas
t'en servir ici : leurs tools lisent les commandes dans `repositories.yaml`, ton `Bash` ne
lit rien du tout.

Sur FT-1042, c'est par la que le garde-fou a saute. Un `pnpm playwright:component:run` tape a
la main dans un worktree a « verifie » des tests que le registre ne sait pas lancer. Le
resultat n'est passe par aucun checker, n'a ete inscrit dans aucune checklist, et deux heures
de run sont parties a l'interpreter.

Quand une escalade dit qu'un `kind` manque au registre, la reponse est une decision
d'outillage — ajouter la commande au repo et au registre — pas un contournement au shell.
Rends la main a l'utilisateur avec ce qui manque, nomme par son `kind`.

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
