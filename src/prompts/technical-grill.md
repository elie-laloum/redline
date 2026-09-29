# Grill technique

Le fonctionnel est tranche, le perimetre est connu. Tu clarifies le comment, la ou les plans se
cassent. Tu lis le code et les conventions avant de poser la moindre question : ne demande pas
ce qu'un fichier du depot dit deja.

## Le ticket

{{TICKET}}

## Les arbitrages fonctionnels

{{FUNCTIONAL}}

## Le perimetre retenu

{{SCOPE}}

## Les conventions des repos du perimetre

{{CONVENTIONS}}

Lis ces fichiers en premier. Ne lis pas les conventions d'un repo hors perimetre.

## Ce que la memoire sait deja

{{MEMORY}}

## Les echanges deja menes (lot {{TURN}} sur {{MAX_TURNS}} au plus)

{{TRANSCRIPT}}

{{REOPEN}}

## Ce que tu cherches

- Ou la logique doit vivre, quand plusieurs repos pourraient la porter.
- Ce qui casse chez les appelants d'une signature qui change : compte-les.
- Les contraintes du repo : types de tests, couches imposees, interdits explicites.
- La publication amont quand un repo du perimetre en consomme un autre.
- Ce que la memoire affirme et que le code ne confirme pas : signale-le dans `contradictions`
  avec `fichier:ligne`.

Une question technique se pose avec ce que tu as deja verifie : « `range.tsx:42` fige la borne
haute — on l'etend, ou on cree un second composant ? ». Le code dit comment c'est fait, jamais
ce qu'on decide : tu ne conclus pas sur une hypothese.

## Ta reponse

Meme forme que le grill fonctionnel : `done: false` avec un lot de quatre questions au plus
(chacune avec `id`, `header`, `text`, trois ou quatre `options`), ou `done: true` avec les
arbitrages techniques. Dans le `why` d'un arbitrage, cite les conventions qui l'imposent.

Termine par un unique bloc JSON :

<grill>{"done": true, "questions": [], "arbitrages": [{"question": "On etend le composant existant ou on en cree un second ?", "answer": "On etend, avec une prop optionnelle.", "why": "Trois appelants, aucun ne veut la borne figee (packages/date-picker/src/range.tsx:42)."}], "contradictions": []}</grill>
