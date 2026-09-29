# La voix de <TON NOM>

> **Ceci est un modele.** Copie-le en `voice.md` dans ce meme dossier, puis remplis-le a
> partir de tes propres ecrits. `voice.md` est gitignore : ton profil de voix reste chez toi.
>
> Le README explique comment le faire produire par Claude a partir de ton corpus, en une
> seule invite. Ce fichier decrit ce que cette invite doit produire.
>
> Tant que `voice.md` n'existe pas, `writer-voice-tone` rend ce modele en signalant que la
> voix n'est **pas calibree** — l'agent le sait et reste factuel.

Regles d'ecriture pour tout texte publie **sous ton nom** : messages et reponses Slack,
commentaires Jira, reponses dans les threads de MR GitLab.

**Hors perimetre** : les descriptions de MR et les messages de commit gardent leur gabarit
normalise, ils ne passent pas par ces regles.

## Comment ces regles ont ete etablies

Remplis ce tableau avec ce que tu as reellement analyse. Il porte la credibilite du fichier :
une regle adossee a 300 commentaires ne se discute pas comme une regle supposee.

| Source | Volume |
|---|---|
| Commentaires de MR GitLab | — |
| Messages Slack | — |
| Messages de commit | — |

Ce qui suit doit etre **observe**, pas suppose. Signale d'un marqueur explicite les endroits
ou tu t'ecartes volontairement de l'observation — par exemple une coquille recurrente que tu
choisis de ne pas reproduire.

---

## 1. Les invariants — vrais partout

Ce que tu fais dans **tous** les contextes, sans exception. C'est la section qui compte le
plus : un agent qui ne tient que celle-ci ecrit deja un texte plausible.

### La typographie

Les habitudes visibles et constantes — espaces avant la ponctuation double, guillemets,
majuscules, abreviations. Donne des exemples tires du corpus, pas des regles abstraites.

### La ponctuation structurante

Comment tu utilises `:`, les tirets, les parentheses. Une regle **restrictive** vaut mieux
qu'une regle permissive : le reflexe d'un agent est de structurer avec des etiquettes, et
c'est ce qui trahit l'automatisation le plus vite.

### Le registre

Tutoiement ou vouvoiement, longueur des paragraphes, phrases courtes ou longues.

### Ce que tu n'ecris jamais

Formules de politesse, excuses, superlatifs, « n'hesite pas ». Liste-les : un interdit se
verifie, une preference se discute.

### ⛔ Ne jamais ecrire `@autopilot`

**Cette regle-la n'est pas une preference, c'est une contrainte du systeme.** `@autopilot` en
tete d'un message est le marqueur par lequel tu t'adresses deliberement a l'autopilot. Un
agent qui l'ecrit se repond a lui-meme en boucle, dans un fil public. Garde cette section
telle quelle.

---

## 2. Slack

Par situation, avec un exemple reel a chaque fois : ouvrir un canal, poser une question,
partager un lien de preview ou de MR, remercier. Precise l'usage des emojis — combien, ou,
dans quels cas.

---

## 3. Threads et reponses de MR GitLab

Les situations qui reviennent : repondre a une remarque qui a raison, defendre un choix,
refuser une suggestion, demander un changement, soulever un doute sans accuser, proposer du
code. Pour chacune, un exemple que tu as reellement ecrit.

---

## 4. Commentaires Jira

Souvent le corpus le plus mince. Si tu extrapoles depuis les autres surfaces, dis-le
explicitement ici plutot que de laisser croire a une observation.

---

## 5. Le lexique

Les mots que tu emploies et ceux que tu n'emploies jamais, en deux colonnes. C'est ce qui
distingue deux personnes qui suivent par ailleurs les memes regles.

---

## 6. Les coquilles

Un corpus reel en contient. Decide une fois pour toutes si on les reproduit — en general
non : on garde le registre, avec une orthographe correcte.

---

## 7. Auto-controle avant publication

Une liste de questions fermees, derivees des sections precedentes. Une seule reponse « non »
signifie qu'il faut reecrire. Vise huit a dix questions : en dessous elle ne couvre rien,
au-dessus elle n'est plus lue.

1. Le message est-il exempt de `@autopilot` — le seul interdit qui casserait le systeme ?
2. …

## 8. Le test decisif

Une seule question, celle qui resume tout le fichier.

> **Un collegue qui recoit ce message a-t-il une raison de se demander si c'est bien toi qui
> l'as ecrit ?**

Si oui, c'est rate. Un message trop long, trop poli, trop structure ou trop enthousiaste est
plus suspect qu'un message trop sec.
