/**
 * Les deux grills, question par question.
 *
 * `ask-user` **bloque le workflow** : poser six questions l'une apres l'autre,
 * c'est six arrets la ou un seul suffit. Un grill ne pose donc pas des
 * questions, il pose des **lots** — tout ce qui peut etre demande au meme
 * moment part ensemble, et le run ne repart qu'une fois le lot entier rendu.
 * C'est cette forme-la qu'il faut montrer, et c'est celle-ci.
 *
 * Le grill technique en pose deux fois plus que le fonctionnel, et c'est normal :
 * le fonctionnel arbitre ce que le ticket dit a moitie, le technique arbitre
 * tout ce qu'il ne dit pas du tout.
 *
 * **La reponse retenue n'est pas toujours la premiere.** Les options sont
 * ecrites dans l'ordre ou un agent les proposerait — la plus attendue d'abord,
 * pas la plus juste — et `answer` dit laquelle a ete choisie. Quand c'est une
 * chaine, c'est que personne n'avait la bonne : la reponse a ete ecrite dans le
 * champ libre, qui existe exactement pour ce cas.
 */

/** Une question du lot : ce qu'on demande, ce qu'on propose, ce qui a ete retenu. */
export interface GrillQuestion {
  readonly key: string;
  /** Deux ou trois mots, affiches en etiquette. */
  readonly header: string;
  readonly question: string;
  /** Entre deux et quatre. Au-dela, c'est un formulaire, plus un arbitrage. */
  readonly options: readonly string[];
  /** L'indice de l'option retenue, ou le texte ecrit dans le champ libre. */
  readonly answer: number | string;
  /** L'arbitrage tel qu'il est range dans le dossier. */
  readonly settled: string;
  readonly why: string;
}

/** Un lot, pose en une fois. Il arrete le run jusqu'a ce qu'il soit rendu entier. */
export interface GrillBatch {
  /** Minutes avant maintenant : quand le lot part, quand il revient. */
  readonly asked: number;
  readonly answered: number;
  readonly about: string;
  readonly questions: readonly GrillQuestion[];
}

/** La reponse retenue, en clair — l'option choisie ou ce qui a ete ecrit. */
export function chosen(question: GrillQuestion): string {
  return typeof question.answer === "number" ? question.options[question.answer] : question.answer;
}

export const FUNCTIONAL: readonly GrillBatch[] = [
  {
    asked: 173,
    answered: 169,
    about: "l'arithmétique du panneau",
    questions: [
      {
        key: "sliders",
        header: "Sliders",
        question: "Déplacer un slider ajuste-t-il automatiquement les trois autres pour tenir 100 % ?",
        options: ["Oui, les autres se rééquilibrent au prorata", "Non, ils sont indépendants"],
        answer: 1,
        settled: "Non. Les 4 sliders sont totalement indépendants ; c'est à l'utilisateur de ramener lui-même le total à 100 %.",
        why: "Confirmé par le scénario 1, où le total monte librement à 110 % avant d'être rattrapé à la main sur un autre critère.",
      },
      {
        key: "score",
        header: "Score",
        question: "Quand le score global affiché en haut de la feuille est-il recalculé ?",
        options: ["Pendant le réglage, en temps réel", "À l'enregistrement", "Au prochain chargement de la feuille"],
        answer: 1,
        settled: "À l'enregistrement uniquement. Tant que la modale n'est pas validée, le score de la feuille ne bouge pas.",
        why: "Lève la contradiction entre le scénario 1 et le TNR 1 : « temps réel » y signifie sans rechargement après l'enregistrement, pas pendant le déplacement des sliders.",
      },
      {
        key: "pas",
        header: "Pas",
        question: "Quel pas les sliders suivent-ils ?",
        options: ["1 point", "5 points", "10 points", "Libre, sans pas"],
        answer: 1,
        settled: "5 points, de 0 à 100. Le champ numérique suit le même pas que le slider.",
        why: "C'est le critère d'acceptation. Un pas libre aurait rendu le total à 100 % presque impossible à viser à la souris.",
      },
      {
        key: "total",
        header: "Total",
        question: "Que montre le panneau tant que le total ne vaut pas 100 % ?",
        options: ["Un message d'erreur sous le total", "Rien, le bouton désactivé suffit", "Le total en rouge, et Enregistrer désactivé"],
        answer: 2,
        settled: "Le total passe en rouge et le bouton Enregistrer reste désactivé. Pas de message en plus.",
        why: "Deux signaux pour une seule règle suffisent ; un troisième aurait fait du bruit à chaque mouvement de slider.",
      },
      {
        key: "ouverture",
        header: "Ouverture",
        question: "D'où le panneau s'ouvre-t-il ?",
        options: ["Les réglages du dossier", "Un bouton « Pondérations » dans la barre de la feuille", "Le menu contextuel du score"],
        answer: 1,
        settled: "Depuis un bouton « Pondérations » dans la barre d'actions de la feuille.",
        why: "Les pondérations appartiennent à la feuille ; les ranger dans les réglages du dossier aurait suggéré l'inverse.",
      },
      {
        key: "defaut",
        header: "Défaut",
        question: "Que remet le bouton « Rétablir les valeurs par défaut » ?",
        options: ["Les dernières valeurs enregistrées", "25 / 25 / 25 / 25", "30 / 30 / 25 / 15"],
        answer: 2,
        settled: "30 / 30 / 25 / 15 — les valeurs figées dans le code aujourd'hui.",
        why: "« Par défaut » ne veut pas dire « annuler mes changements » : le bouton ramène au réglage d'origine, pas au dernier enregistré.",
      },
    ],
  },
  {
    asked: 168,
    answered: 164.5,
    about: "les bords",
    questions: [
      {
        key: "abandon",
        header: "Abandon",
        question: "Que devient un réglage en cours si on ferme le panneau sans enregistrer ?",
        options: ["Une confirmation est demandée", "Il est perdu, sans confirmation"],
        answer: 1,
        settled: "Il est perdu, et rien ne prévient. Fermer le panneau annule.",
        why: "Le ticket ne dit rien de l'abandon. Demander une confirmation aurait ajouté une décision que personne n'a prise — on reste sur le comportement des autres modales de la feuille.",
      },
      {
        key: "zero",
        header: "Zéro",
        question: "Un critère peut-il être ramené à 0 %, donc sortir du calcul ?",
        options: ["Oui, 0 est une valeur valide", "Non, le minimum est 5 %"],
        answer: 0,
        settled: "Oui. 0 est une valeur valide, et le critère cesse alors de peser sur le score.",
        why: "Le pas de 5 part de 0 dans le critère d'acceptation ; interdire 0 aurait été une règle de plus, écrite nulle part.",
      },
      {
        key: "archives",
        header: "Archives",
        question: "Changer les pondérations recalcule-t-il le score des feuilles déjà archivées ?",
        options: ["Oui, tout l'historique est recalculé", "Non, seules les feuilles actives", "Seules celles de l'exercice en cours"],
        answer: 1,
        settled: "Non. Seules les feuilles actives sont recalculées ; une feuille archivée garde le score qu'elle avait.",
        why: "Une feuille archivée est une photo à une date — la recalculer réécrirait un score déjà opposé au client.",
      },
      {
        key: "saisie",
        header: "Saisie",
        question: "Le champ numérique accepte-t-il une valeur hors pas, tapée à la main ?",
        options: ["Oui, elle est arrondie au pas le plus proche", "Oui, telle quelle", "Non, la saisie est refusée"],
        answer: 0,
        settled: "Oui, mais elle est arrondie au multiple de 5 le plus proche dès que le champ perd le focus.",
        why: "Refuser la frappe aurait bloqué la saisie au clavier au deuxième caractère ; accepter 37 aurait cassé le pas que le slider garantit.",
      },
      {
        key: "trace",
        header: "Traçabilité",
        question: "Garde-t-on trace de qui a changé les pondérations d'une feuille ?",
        options: ["Non, rien n'est tracé", "Oui, mais seulement la date", "Oui, l'auteur et la date"],
        answer: "Oui — l'auteur, la date et les quatre valeurs, dans le journal d'audit de la feuille",
        settled: "Oui : l'auteur, la date et les quatre valeurs partent dans le journal d'audit existant de la feuille.",
        why: "Aucune des trois propositions ne suffisait. Un contrôle LAB se rejoue des années après : savoir qu'on a changé les poids sans savoir lesquels ne sert à rien.",
      },
    ],
  },
  {
    asked: 164,
    answered: 161,
    about: "les droits et la portée",
    questions: [
      {
        key: "droits",
        header: "Droits",
        question: "Quels profils peuvent modifier les pondérations d'une feuille ?",
        options: ["Tout profil ayant accès à la feuille", "Associé et Expert-comptable", "Associé seulement"],
        answer: 1,
        settled: "Associé et Expert-comptable. Les autres profils voient le panneau en lecture seule.",
        why: "Le critère d'acceptation ne nomme que ces deux profils, et la maquette montre le panneau sans bouton pour les autres — il fallait trancher entre cacher et désactiver.",
      },
      {
        key: "lecture",
        header: "Lecture seule",
        question: "Que voit un profil qui n'a pas le droit de modifier ?",
        options: ["Pas de bouton du tout", "Le panneau, en lecture seule", "Le panneau, mais Enregistrer désactivé"],
        answer: 1,
        settled: "Le panneau s'ouvre, sliders et champs désactivés, sans bouton Enregistrer.",
        why: "Cacher le bouton aurait caché l'information : savoir comment le score de sa feuille est pondéré intéresse tous les profils, le changer non.",
      },
      {
        key: "portee",
        header: "Portée",
        question: "Changer une feuille affecte-t-il les autres feuilles du même dossier ?",
        options: ["Oui, le dossier porte les pondérations", "Non, chaque feuille a les siennes"],
        answer: 1,
        settled: "Non. Les pondérations sont propres à chaque feuille ; en changer une n'affecte aucune autre.",
        why: "C'est un critère d'acceptation, et c'est lui qui décide du stockage : sur la feuille, pas sur le dossier.",
      },
      {
        key: "nouvelle",
        header: "Nouvelle feuille",
        question: "Avec quoi une feuille créée après la livraison démarre-t-elle ?",
        options: ["Les valeurs par défaut 30 / 30 / 25 / 15", "Les pondérations de la dernière feuille du dossier", "Rien, il faut les régler"],
        answer: 0,
        settled: "Avec 30 / 30 / 25 / 15, comme toutes les feuilles existantes après la migration.",
        why: "Hériter du dossier aurait créé une règle implicite que le ticket n'énonce nulle part, et rendu le score d'une feuille neuve imprévisible.",
      },
      {
        key: "libelles",
        header: "Libellés",
        question: "Les quatre critères gardent-ils les noms qu'ils portent aujourd'hui ?",
        options: ["Oui : Client, Activité, Localisation, Mission", "Ils sont renommés dans la maquette"],
        answer: 0,
        settled: "Oui : Client, Activité, Localisation, Mission. Les mêmes qu'aujourd'hui, dans le même ordre.",
        why: "La maquette les reprend à l'identique — l'ordre du panneau est aussi celui du calcul, et le changer aurait déplacé un repère pour rien.",
      },
    ],
  },
];

export const TECHNICAL: readonly GrillBatch[] = [
  {
    asked: 144,
    answered: 142,
    about: "le stockage",
    questions: [
      {
        key: "stockage",
        header: "Stockage",
        question: "Où vivent les pondérations : sur la feuille ou sur le dossier ?",
        options: ["Table dédiée lab_weights", "Colonne weights JSONB sur lab_worksheet", "Quatre colonnes entières, une par critère"],
        answer: 1,
        settled: "Sur la feuille. Une colonne `weights` en JSONB sur `lab_worksheet`, pas de table dédiée.",
        why: "L'isolation entre feuilles est un critère d'acceptation ; une table partagée la rendrait accidentelle plutôt que structurelle.",
      },
      {
        key: "existant",
        header: "Existant",
        question: "Que vaut la nouvelle colonne pour les feuilles déjà en base ?",
        options: ["NULL, et le calcul retombe sur les constantes", "La migration écrit 30/30/25/15 partout"],
        answer: 1,
        settled: "La migration écrit 30 / 30 / 25 / 15 sur toutes les lignes existantes. Pas de NULL, pas de repli.",
        why: "Laisser NULL aurait gardé deux sources pour un même poids — la colonne et les constantes — donc deux scores possibles pendant toute la transition.",
      },
      {
        key: "forme",
        header: "Forme",
        question: "Quelle forme prend le JSONB ?",
        options: ["Un tableau de quatre entiers, dans l'ordre des critères", "Un objet clé → entier, une clé par critère"],
        answer: 1,
        settled: "Un objet : `{ client, activite, localisation, mission }`, quatre entiers.",
        why: "Un tableau aurait fait dépendre la lecture de l'ordre des critères — le jour où un cinquième arrive, toutes les lignes deviennent fausses en silence.",
      },
      {
        key: "down",
        header: "Réversibilité",
        question: "Que doit faire le down de la migration ?",
        options: ["Supprimer la colonne, sans plus", "Supprimer la colonne et restaurer les valeurs par défaut dans le calcul"],
        answer: 1,
        settled: "Supprimer la colonne **et** remettre le calcul sur les constantes 30 / 30 / 25 / 15.",
        why: "Un down qui laisse le calcul chercher une colonne disparue n'est pas réversible, il est cassé — c'est la note repos/web-app-core/migrations.md.",
      },
      {
        key: "contrainte",
        header: "Contrainte",
        question: "Le total à 100 % est-il contraint en base ?",
        options: ["Oui, une contrainte CHECK sur la colonne", "Non, la règle vit dans le service", "Oui, un trigger"],
        answer: 1,
        settled: "Non. La règle des 100 % est vérifiée dans le service, pas par le schéma.",
        why: "Une contrainte CHECK sur du JSONB se maintient mal et bloquerait toute reprise de données ; la règle est métier, elle reste là où le métier est testé.",
      },
      {
        key: "index",
        header: "Index",
        question: "Faut-il indexer la colonne ?",
        options: ["Oui, un index GIN", "Non, elle n'est jamais un critère de recherche"],
        answer: 1,
        settled: "Non. La colonne se lit toujours par la feuille, jamais en filtre.",
        why: "Un index GIN sur une colonne qu'on ne cherche pas coûte à chaque écriture et ne rend rien.",
      },
    ],
  },
  {
    asked: 141.5,
    answered: 139.5,
    about: "le calcul",
    questions: [
      {
        key: "calcul",
        header: "Calcul",
        question: "Où se calcule le score global aujourd'hui ?",
        options: ["Le front recompose le score", "Le back calcule et renvoie le score"],
        answer: 1,
        settled: "Dans web-app-core. Le back calcule et renvoie le score ; le front ne fait que l'afficher.",
        why: "Recalculer côté front aurait dupliqué la règle ALTAIR dans deux dépôts, avec deux vérités possibles pour un même score.",
      },
      {
        key: "constantes",
        header: "Constantes",
        question: "Que deviennent les quatre constantes de score.ts ?",
        options: ["Elles restent, en repli si la colonne est vide", "Elles deviennent les valeurs par défaut de la migration, et sortent du calcul", "Elles sont supprimées sans remplacement"],
        answer: 1,
        settled: "Elles sortent du calcul et ne survivent que comme valeurs par défaut de la migration et du bouton Rétablir.",
        why: "Les garder en repli aurait recréé la double source qu'on vient d'éliminer en remplissant la colonne partout.",
      },
      {
        key: "arrondi",
        header: "Arrondi",
        question: "Comment le score pondéré est-il arrondi ?",
        options: ["À l'entier le plus proche, comme aujourd'hui", "À deux décimales", "Pas d'arrondi, le front formate"],
        answer: 0,
        settled: "À l'entier le plus proche, exactement comme le calcul actuel.",
        why: "Le score est déjà affiché en entier partout ; changer l'arrondi aurait fait bouger des scores sans qu'aucune pondération n'ait changé.",
      },
      {
        key: "poids-zero",
        header: "Poids nul",
        question: "Un poids à 0 change-t-il la formule ?",
        options: ["Non, le terme s'annule naturellement", "Oui, il faut exclure le critère de la moyenne"],
        answer: 0,
        settled: "Non. Le terme s'annule, la somme des poids vaut toujours 100, la formule ne bouge pas.",
        why: "Exclure le critère aurait changé le dénominateur, donc donné deux formules à tester au lieu d'une.",
      },
      {
        key: "synchrone",
        header: "Synchronisme",
        question: "Le recalcul doit-il rester synchrone à l'enregistrement ?",
        options: ["Non, une file suffit", "Oui, la réponse porte le nouveau score"],
        answer: 1,
        settled: "Oui. L'enregistrement renvoie le score recalculé dans sa réponse.",
        why: "Le critère demande un score à jour sans rechargement — passer par une file aurait obligé le front à repoller pour afficher ce qu'il vient de provoquer.",
      },
    ],
  },
  {
    asked: 139,
    answered: 137,
    about: "le contrat entre les deux dépôts",
    questions: [
      {
        key: "integration",
        header: "Intégration",
        question: "Comment web-app récupère-t-il le contrat livré par web-app-core ?",
        options: ["En lisant le dépôt en direct", "Par le paquet versionné"],
        answer: 1,
        settled: "Par le paquet versionné. web-app-core est publié en amont, puis web-app bump sa dépendance.",
        why: "C'est ce que dit la note integrations/web-app-core-vers-web-app.md, et c'est ce qui impose l'ordre des niveaux dans le plan.",
      },
      {
        key: "ordre",
        header: "Ordre",
        question: "Dans quel ordre les deux dépôts sont-ils livrés ?",
        options: ["web-app-core d'abord, web-app ensuite", "En parallèle, derrière un drapeau", "web-app d'abord"],
        answer: 0,
        settled: "web-app-core d'abord, jusqu'au tag et à la pipeline verte ; web-app ensuite.",
        why: "Le front consomme un type et une colonne qui n'existent pas avant la livraison amont — l'ordre n'est pas une préférence, c'est une dépendance.",
      },
      {
        key: "types",
        header: "Types",
        question: "Le type des pondérations est-il exporté par le paquet ?",
        options: ["Oui, et web-app l'importe", "Non, web-app le redéclare de son côté"],
        answer: 0,
        settled: "Oui, exporté par web-app-core et importé tel quel par web-app.",
        why: "Redéclarer le type aurait laissé les deux dépôts diverger sans que le typecheck ne dise rien.",
      },
      {
        key: "bump",
        header: "Bump",
        question: "Le bump de dépendance part-il dans la MR du front ?",
        options: ["Non, une MR séparée avant", "Oui, la MR front porte le bump"],
        answer: 1,
        settled: "Oui. La MR de web-app porte le bump et le code qui l'utilise.",
        why: "Un bump seul est une MR qui ne prouve rien : elle passe au vert sans qu'aucun appelant n'ait été écrit.",
      },
      {
        key: "compat",
        header: "Compatibilité",
        question: "Le back doit-il rester compatible avec un front qui n'envoie pas de pondérations ?",
        options: ["Oui, le temps de la livraison croisée", "Non, les deux partent ensemble"],
        answer: 0,
        settled: "Oui. Une requête sans `weights` garde les pondérations en base, le temps que le front suive.",
        why: "Les deux dépôts ne sont pas déployés à la même seconde — pendant l'intervalle, l'ancien front parle au nouveau back.",
      },
      {
        key: "endpoint",
        header: "API",
        question: "Quelle forme prend l'enregistrement des pondérations ?",
        options: ["Un PATCH sur la feuille, avec weights dans le corps", "Un POST dédié /weights", "Un PUT complet de la feuille"],
        answer: 0,
        settled: "Un PATCH sur la feuille, `weights` dans le corps, et le score recalculé dans la réponse.",
        why: "Un endpoint dédié aurait fait un second chemin d'écriture sur la feuille, avec ses propres droits à tenir en phase.",
      },
    ],
  },
  {
    asked: 136.5,
    answered: 134.5,
    about: "les garde-fous",
    questions: [
      {
        key: "garde-fou",
        header: "Garde-fou",
        question: "Le total à 100 % est-il revérifié côté serveur, ou le front suffit-il ?",
        options: ["Non, le front garantit déjà la règle", "Oui, refusé à l'enregistrement"],
        answer: 1,
        settled: "Revérifié côté serveur : un enregistrement dont le total ne vaut pas 100 % est refusé.",
        why: "Le bouton désactivé est un confort, pas une garantie — l'API est atteignable sans passer par la modale.",
      },
      {
        key: "droits-back",
        header: "Droits",
        question: "Où les droits Associé / Expert-comptable sont-ils vérifiés ?",
        options: ["Dans le composant, avant d'afficher le bouton", "Côté serveur, à l'enregistrement", "Les deux"],
        answer: 2,
        settled: "Les deux. Le front masque ce qui n'est pas permis, le serveur refuse ce qui ne l'est pas.",
        why: "Le front seul se contourne ; le serveur seul laisse afficher un bouton qui échouera. Les deux disent la même règle à deux endroits, et c'est voulu.",
      },
      {
        key: "erreur",
        header: "Erreur",
        question: "Que renvoie le serveur sur un total invalide ?",
        options: ["400, avec le total reçu dans le détail", "422", "409", "200 avec un avertissement"],
        answer: 0,
        settled: "400, en rappelant le total reçu — c'est une requête malformée, pas un conflit.",
        why: "La feuille rend déjà des 400 sur validation ; introduire un 422 ici aurait donné deux codes pour la même famille d'erreur.",
      },
      {
        key: "bornes",
        header: "Bornes",
        question: "Les valeurs hors 0-100 sont-elles rejetées côté serveur ?",
        options: ["Oui, par le schéma de validation", "Elles sont ramenées dans les bornes"],
        answer: 0,
        settled: "Rejetées par le schéma. Aucune correction silencieuse.",
        why: "Ramener 150 à 100 aurait enregistré autre chose que ce qui a été envoyé, sans que personne ne le sache.",
      },
      {
        key: "concurrence",
        header: "Concurrence",
        question: "Deux enregistrements simultanés sur la même feuille, que fait-on ?",
        options: ["Le dernier gagne", "Verrou optimiste sur la version de la feuille", "On refuse le second"],
        answer: "Le dernier gagne — c'est déjà la règle de la feuille, ce ticket ne la change pas",
        settled: "Le dernier gagne, comme partout ailleurs sur la feuille. Ce ticket n'introduit pas de verrou.",
        why: "Ajouter un verrou optimiste ici aurait donné à un champ de la feuille une garantie que la feuille entière n'a pas — donc deux comportements à expliquer au lieu d'un.",
      },
    ],
  },
  {
    asked: 134,
    answered: 132.5,
    about: "les tests",
    questions: [
      {
        key: "session",
        header: "Profils",
        question: "Comment les tests de composant simulent-ils le profil de l'utilisateur ?",
        options: ["Par un mock du hook de droits", "Par le contexte de session, comme le reste de la feuille"],
        answer: 1,
        settled: "Par le contexte de session, comme le reste de la feuille. Pas de mock du hook de droits.",
        why: "Mocker le hook aurait testé le mock : c'est le câblage entre la session et le panneau qui porte le risque.",
      },
      {
        key: "runner",
        header: "Runner",
        question: "Quel runner de test tourne sur web-app ?",
        options: ["vitest", "rstest", "jest"],
        answer: 1,
        settled: "rstest, depuis le bump de janvier — la note de mémoire dit encore vitest, elle est fausse.",
        why: "package.json:31 tranche. C'est la contradiction relevée au tour ciblé, et elle part en correction de mémoire.",
      },
      {
        key: "migration-test",
        header: "Migration",
        question: "La migration est-elle testée ?",
        options: ["Oui, un test d'intégration qui la monte et la redescend", "Non, la CI la joue déjà au déploiement"],
        answer: 0,
        settled: "Oui : un test d'intégration qui applique le up, vérifie les valeurs par défaut, applique le down et vérifie le retour.",
        why: "C'est le seul moyen de prouver la réversibilité avant qu'un rollback en production ne la teste à notre place.",
      },
      {
        key: "isolation",
        header: "Isolation",
        question: "Comment prouve-t-on l'isolation entre feuilles ?",
        options: ["Deux feuilles du même dossier, une modifiée, l'autre relue inchangée", "Une assertion sur la requête SQL émise"],
        answer: 0,
        settled: "Deux feuilles d'un même dossier : on change l'une, on relit l'autre, elle n'a pas bougé.",
        why: "Assertions sur le SQL testent l'implémentation ; le critère d'acceptation parle du résultat, le test aussi.",
      },
      {
        key: "e2e",
        header: "Bout en bout",
        question: "Un test end-to-end est-il attendu sur ce ticket ?",
        options: ["Oui, le parcours complet depuis la feuille", "Non, les tests de composant couvrent le panneau"],
        answer: 1,
        settled: "Non. Les tests de composant couvrent le panneau, l'intégration couvre la colonne et le calcul.",
        why: "Le parcours traversé est déjà couvert par l'e2e de la feuille LAB ; en ajouter un aurait allongé la CI sans couvrir une ligne de plus.",
      },
      {
        key: "fixtures",
        header: "Fixtures",
        question: "Les fixtures existantes portent-elles déjà des pondérations ?",
        options: ["Non, il faut les compléter à la main", "Oui, depuis la migration"],
        answer: 1,
        settled: "Oui : les fixtures passent par la migration, elles héritent donc de 30 / 30 / 25 / 15.",
        why: "Les compléter à la main aurait figé une deuxième source de valeurs par défaut, à re-corriger au premier changement.",
      },
    ],
  },
  {
    asked: 132.2,
    answered: 131,
    about: "le front",
    questions: [
      {
        key: "etat",
        header: "État",
        question: "Où vit l'état du panneau pendant le réglage ?",
        options: ["Dans un store global", "Dans un hook local au panneau", "Dans l'URL"],
        answer: 1,
        settled: "Dans un hook local au panneau. Rien ne sort du composant tant qu'on n'a pas enregistré.",
        why: "Un réglage abandonné doit disparaître avec la modale — dans un store global, il aurait survécu à sa fermeture.",
      },
      {
        key: "sync",
        header: "Synchronisation",
        question: "Slider et champ numérique, comment restent-ils synchronisés ?",
        options: ["Une seule source dans le hook, les deux la lisent", "Le champ écoute le slider et se met à jour"],
        answer: 0,
        settled: "Une seule valeur dans le hook ; slider et champ en sont deux vues.",
        why: "Deux états qui s'écoutent finissent toujours par se désynchroniser sur un cas — ici, la saisie arrondie au pas.",
      },
      {
        key: "invalidation",
        header: "Cache",
        question: "Que fait le front après un enregistrement réussi ?",
        options: ["Il invalide la query de la feuille", "Il écrit le nouveau score dans le cache", "Il recharge la page"],
        answer: "Il écrit le score renvoyé dans le cache, puis invalide la feuille en arrière-plan",
        settled: "Les deux : le score renvoyé est posé dans le cache tout de suite, et la feuille est invalidée derrière.",
        why: "Invalider seul aurait fait clignoter le score le temps du refetch ; écrire seul aurait laissé le reste de la feuille périmé.",
      },
      {
        key: "clavier",
        header: "Clavier",
        question: "Les sliders sont-ils utilisables au clavier ?",
        options: ["Oui : flèches, Début et Fin, avec un libellé par critère", "Le champ numérique suffit pour le clavier"],
        answer: 0,
        settled: "Oui. Flèches au pas de 5, Début et Fin aux bornes, et un libellé accessible par critère.",
        why: "Le champ seul aurait rendu la moitié du panneau inatteignable au clavier, sur un écran qu'un profil Associé utilise tous les jours.",
      },
      {
        key: "dialog",
        header: "Composant",
        question: "Le panneau réutilise-t-il le Dialog de la librairie ?",
        options: ["Oui, celui de la librairie", "Un nouveau, la maquette s'en écarte"],
        answer: 0,
        settled: "Oui, le Dialog existant. La maquette n'en diffère que par le contenu.",
        why: "Le focus piégé, l'échappement et le retour de focus sont déjà résolus dedans — les réécrire aurait été trois bugs d'accessibilité à découvrir.",
      },
    ],
  },
];
