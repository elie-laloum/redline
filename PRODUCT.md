# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

**Aujourd'hui, une seule personne : l'utilisateur**, qui lance le run depuis son terminal et garde le
live shell dans un onglet parmi d'autres. Il ne le regarde pas en continu — il l'ouvre
**quand il se demande où ça en est**, et le referme.

**Direction confirmée : ça deviendra un outil d'équipe.** D'autres développeurs lanceront
leurs propres runs et ouvriront leur propre shell. Ils ne connaîtront pas le vocabulaire du
workflow — ni les noms d'agents, ni la numérotation des étapes, ni ce qu'est un « adversaire »
ou une « contradiction mémoire ». Ce n'est pas une évolution lointaine à anticiper vaguement :
c'est une contrainte qui s'applique dès maintenant à chaque libellé écrit.

## Product Purpose

Rendre lisible un run d'autopilot — un enchaînement de treize étapes et d'une quinzaine
d'agents, qui peut durer trois heures et traverser quatre dépôts.

Le critère de réussite est précis et il vient de la spécification : **un run de trois heures
sur quatre dépôts doit rester compréhensible en dix secondes de lecture**. Dix secondes par
quelqu'un qui arrive à froid, pas par quelqu'un qui suivait déjà.

L'échec est symétrique : une page qu'il faut parcourir, recouper ou interpréter a raté son
travail, même si toute l'information y est.

## Positioning

**C'est une fenêtre sur un run, jamais un pilote.**

Un tableau de bord de CI ou une console d'agent cherchent à devenir le point de contrôle. Ici
c'est l'inverse, et c'est délibéré : la page **n'écrit rien**. L'autorité reste au terminal et
aux fichiers sur disque. `write-store-ticket` est le seul écrivain de l'état du ticket ; le
shell le relit, il ne le touche pas.

Conséquence assumée : **le shell n'est jamais un point de défaillance**. S'il meurt en cours
de route, le run continue dans le terminal. La seule chose qui se dégrade, c'est le confort.
Les events sont écrits sur disque **avant** d'être diffusés, ce qui rend cette promesse vraie
plutôt qu'affichée.

La seule exception est `ask-user`, qui bloque volontairement le workflow jusqu'à la réponse —
et qui a un repli terminal quand le shell ne répond plus.

## Operating Context

Lancé par le tool `launch-live-mode` quand un run démarre avec `--live`, sur un port libre
entre 12000 et 13000, ouvert tout seul dans le navigateur par défaut.

- **Un shell = un run.** À la fin il reste ouvert et affiche l'état final ; il ne se ferme pas
  tout seul.
- **Arriver en cours de route est le cas normal.** Sur une reprise, le shell rejoue tout
  l'historique d'events avant de se brancher sur le direct.
- Le run se déroule en trois phases : cadrage (points 1 à 9, une fois), implémentation (point
  10, rejouée pour chaque dépôt par `level` croissant), capitalisation et publication (11 à 13).
- Le seul moment où l'humain est requis est le **gate du point 9**. Tout ce qui suit s'exécute
  sans nouvelle validation, sauf escalade.

## Capabilities and Constraints

**Ce que la page doit rendre lisible**, d'après la spécification : l'en-tête du ticket et son
statut Jira, les dépôts du périmètre avec leur `level` et leur état, les treize étapes avec
l'étape courante, l'agent et le tool en cours, les compteurs de boucle face à leur budget, la
todo list du developer en direct. Au premier plan dès qu'il y en a : une question d'`ask-user`
et une escalade. Repliés par défaut : les messages bruts, le détail des events, les checklists
des adversaires.

**Trois canaux, tous locaux.** RPC HTTP entrant pour les events, SSE sortant vers le
navigateur, et un dépôt puis relève pour `ask-user`. Mesuré : environ 1,6 ms par event.

`ask-user` a longtemps tenu un POST ouvert jusqu'à la réponse. Ça ne tient pas : le client
HTTP de Node abandonne une requête dont les en-têtes n'arrivent pas au bout de 300 s, et le
lot repartait au terminal au bout de cinq minutes alors que huit heures sont annoncées. Le
lot se dépose désormais en une requête courte et l'appelant revient le relever toutes les
deux secondes. **Le workflow bloque toujours** — c'est le contrat — mais le blocage est tenu
par une boucle chez l'appelant, pas par une connexion. Effet de bord utile : un shell qui
redémarre pendant l'attente répond « inconnu », et le lot est redéposé au lieu d'être perdu.

**Les questions se posent par lots.** `ask-user` prend une liste — chaque question avec son
étiquette, trois ou quatre options et un champ libre toujours offert. Le lot ne se rend que
complet : répondre à deux questions sur trois relancerait le workflow sur une hypothèse.

**Un event qu'on ne sait pas valider est loggé et ignoré**, jamais affiché à moitié. Une ligne
tronquée coûte plus cher que son absence, parce qu'on la croit.

**Stack en place** : TanStack Start en SSR complet, React 19, Tailwind v4 avec les tokens
Shadcn, Valibot pour la validation des events entrants. Le rendu serveur donne l'état complet
dès la première frame — c'est ce qui sert l'ouverture à froid.

**Volontairement absent en v2** : le workflow 2 (collecte et traitement des retours). Les
champs existent dans l'état du ticket mais ne sont ni lus ni écrits. `mrFeedbackCount` reste à
`null` et se renseigne à la main.

**Non décidé, et qui appartient au design** : comment les trois besoins ci-dessous se
hiérarchisent à l'écran.

## Brand Commitments

Aucune identité visuelle imposée. La spécification demande un style **Shadcn, épuré**, et rien
de plus.

Les règles de voix d'`autopilot/plugins/autopilot/rules/voice.md` **ne s'appliquent pas ici** :
elles régissent ce qui est publié sous l'identité de l'utilisateur — Slack, commentaires Jira, threads
de MR. Cette interface est interne et n'est signée par personne.

## Evidence on Hand

Tout ce que la page affiche existe vraiment, et rien n'est à inventer :

- `~/.autopilot/events/<ticket-id>.jsonl` — le flux réel d'un run, rejouable
- `~/.autopilot/tickets/<ticket-id>.yaml` — l'état du ticket, lu et jamais écrit par le shell
- `~/.autopilot/memory/` — la base de connaissances versionnée
- `pnpm fixtures` — quatre dépôts de fixture pour produire un run de démonstration

**Aucune métrique de performance, aucun taux de réussite, aucun témoignage** n'existe
aujourd'hui. Les trois compteurs du ticket — retours sur MR, interventions humaines, tours de
boucle — sont les seuls chiffres réels, et le premier vaut `null` tant que le workflow 2
n'existe pas. Rien de tout cela ne doit être fabriqué pour remplir un écran.

## Product Principles

1. **Dix secondes, à froid.** La page est ouverte par quelqu'un qui revient après une heure.
   Tout ce qui demande de recouper deux endroits est un échec de conception, pas un détail.

2. **Trois questions, en même temps.** Quand rien n'est bloqué, la page doit répondre d'un
   coup à : *est-ce que ça avance et à quel rythme*, *qu'est-ce que les agents ont décidé*, et
   *est-ce que quelque chose dérive*. Aucune des trois ne peut coûter un clic ou un scroll
   pour exister. Ce que le run **produit** — diffs, tests, fichiers touchés — n'en fait pas
   partie : ça se lit dans la MR.

3. **Elle regarde, elle ne pilote pas.** Aucun bouton n'agit sur le run, sauf répondre à une
   question posée. Si la page peut mourir sans conséquence, elle ne doit pas donner
   l'impression du contraire.

4. **Les libellés se lisent seuls.** Un collègue qui n'a jamais lancé de run doit comprendre
   sans qu'on commente par-dessus son épaule. Un jargon interne affiché brut est une dette qui
   se paiera à chaque nouvel arrivant.

5. **Le vide dit quelque chose.** Une mémoire muette, un périmètre pas encore établi, une
   checklist non rendue : chacun de ces états est une information sur l'avancement, pas un
   trou à masquer.

## Accessibility & Inclusion

Aucun standard n'a été imposé pour cette interface interne.

Deux besoins sont établis par les réponses : l'interface doit rester lisible pour quelqu'un
qui **ne connaît pas le vocabulaire du workflow**, et elle doit se comprendre **sans
commentaire oral** — capture d'écran collée dans un channel, partage d'écran, arrivée d'un
nouveau sur l'équipe.
