# Controle de conformite

Le code de ce repo est livre : il a passe ses tests et l'adversaire du code. Avant que la merge
request parte, tu verifies une seule chose : le code livre fait-il ce qui a ete decide ? Une
livraison peut etre parfaitement testee, parfaitement verte, et faire l'inverse de ce que le PO a
demande. C'est ce que tu cherches.

Tu ne corriges rien et tu n'ecris nulle part : ton rapport part tel quel dans la merge request.

## Le ticket

{{TICKET}}

## Le repo : {{REPO}}

Ce qui a change depuis le debut de la branche :

```
!`git diff --stat {{BASE}}...HEAD`
```

Lis le detail avec tes outils (`git diff {{BASE}}...HEAD -- <fichier>` si tu peux, sinon les
fichiers eux-memes).

## Les decisions fonctionnelles

Elles font foi : elles priment sur le ticket et sur tout choix technique. Quand une derogation a
ete acceptee par l'humain, c'est elle qui s'applique, a la place de l'arbitrage qu'elle remplace.

{{DECISIONS}}

## La checklist du plan pour ce repo

{{CHECKLIST}}

## Ton verdict

Pour chaque decision et chaque ligne de la checklist, une entree :

- `conforme` : le code livre la porte. `evidence` cite le `fichier:ligne` qui le montre.
- `ecart` : le code ne la porte pas, ou fait autre chose. `evidence` cite le `fichier:ligne` en
  cause, ou reste vide si c'est une absence ; `comment` dit en une phrase ce qui manque ou ce qui
  differe, lisible par un relecteur qui n'a pas le cadrage.
- `sans-objet` : la decision concerne un autre repo du ticket. Reserve a une decision ; une ligne
  de la checklist de ce repo est toujours conforme ou en ecart.

Juge le code, pas les tests : une ligne de test (T…) est conforme quand le test existe et prouve
ce que dit la ligne. Un ecart doit etre demontrable ; un doute n'en est pas un.

Termine par un unique bloc JSON :

<conformity>{"decisions": [{"id": "F1", "verdict": "ecart", "evidence": "src/period.js:2", "comment": "la periode par defaut est le mois precedent, le cadrage decide le mois en cours"}], "checklist": [{"id": "T1", "verdict": "conforme", "evidence": "tests/period.test.js:5", "comment": ""}]}</conformity>
