---
version: 1
slug: "tools-live-shell-src-routes-index-tsx"
primary_target: "tools/live-shell/src/routes/index.tsx"
related_targets: ["tools/live-shell/src/components/action-bar.tsx","tools/live-shell/src/components/question-panel.tsx","tools/live-shell/src/components/ui.tsx"]
---

# Live-mode — la fenêtre sur un run

**Portée** : `tools/live-shell`, la page unique d'un run d'autopilot.
**Mode visiteur** : Operate. Le visiteur vient savoir où ça en est et décider s'il intervient.

**Audience** : l'utilisateur aujourd'hui, l'équipe demain. Les libellés doivent se lire sans commentaire
oral — jargon de workflow interdit à l'état brut.

**La tâche** : ouvrir un onglet à froid après une heure, et en dix secondes savoir trois choses
à la fois — ça avance et à quel rythme, ce que les agents ont décidé, est-ce que quelque chose
dérive.

**Les quatre dérives à rendre visibles** : une boucle qui approche son budget, une étape
anormalement longue, un agent qui part de travers (ça se juge sur le contenu), une
contradiction mémoire.

**Matière disponible** : le flux d'events `.jsonl`, l'état du ticket `.yaml` — arbitrages,
preuves de périmètre, checklists, contradictions, compteurs. Rien à inventer, aucune métrique
fabriquée.

**Contrainte dure** : la page n'écrit rien et ne pilote rien. Seule exception, répondre à un
lot de questions posé par `ask-user`.

## Direction contract

**THESIS.** La page est le dossier de ce que les agents ont décidé, pas un tableau de bord de
progression. Elle refuse la grille de tuiles-métriques que cette catégorie ship toujours :
ici la matière lisible, ce sont des phrases d'arbitrage et des preuves en `fichier:ligne`, pas
des nombres dans des cartes.

**OWN-WORLD.** Neutres Shadcn, une seule couleur d'accent pour le présent, trois couleurs
d'état (vert, rouge, ambre) qui ne servent qu'à l'état. Un rail vertical à gauche, plein
cadre ; à droite des blocs de preuve citée en texte courant, filets fins, pas de cartes
empilées. Reconnaissable sans contenu : un rail dense contre une colonne de prose.

**STORY.** Il comprend où en est chaque dépôt sans chercher, lit ce qui a été tranché et sur
quelle preuve, repère ce qui dérive avant que ça escalade, et repart — ou répond au lot qui
l'attend.

**FIRST VIEWPORT.** Le rail occupe toute la hauteur sur un quart de large : les treize étapes,
l'étape courante marquée d'un loader qui tourne, sa durée en cours, les compteurs de boucle
face à leur budget, les dépôts du périmètre par level. Les trois quarts restants s'ouvrent sur
les arbitrages rendus — question, réponse, motif — puis les preuves de périmètre et les
checklists ligne par ligne. Un lot de questions ou une escalade prend le dessus du pli quand
il y en a un.

**FORM.** Le dossier d'instruction, cinquième de mes sept structures, désigné par le tirage.
Seed `6b9c0f95`, scope surface, mode operate, code-led.

**SIGNATURE.** Le rail est l'index du dossier. Survoler ou choisir une étape filtre la colonne
de droite sur ce que cette étape a décidé ; l'étape courante y reste marquée en permanence.
C'est ce qui fait que mener par les décisions ne coûte pas l'état — le rail répond à « où on
en est » en continu tout en servant de sommaire. Seule motion continue de la page : le loader
de l'étape courante et la durée qui avance. Tout le reste atterrit sans animation, et
`prefers-reduced-motion` fige le loader sans rien cacher.

**FINISH.** unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

## Décisions non tranchées

- La durée « normale » d'une étape n'est mesurée nulle part : la dérive temporelle se rend
  d'abord par la durée en cours, affichée assez fort. Un seuil viendra quand on aura des runs
  à comparer.
- Le quatrième besoin — diffs, tests, fichiers touchés — reste hors périmètre : ça se lit dans
  la MR.
