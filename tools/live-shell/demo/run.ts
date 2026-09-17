/**
 * La matiere du run de demonstration, et la projection d'un instant.
 *
 * Le shell ne detient rien : il lit l'etat du ticket, le journal d'events et
 * les maquettes dans `AUTOPILOT_HOME`. Une demo n'a donc pas besoin d'un mode
 * special dans l'application — elle a besoin d'un home qui raconte un run.
 * C'est ce que ce module fabrique, et c'est ce qui garantit que la page montree
 * en demo est exactement celle d'un vrai run.
 *
 * **Le run n'est plus un seul etat, c'est une bande.** Le seed ecrivait la
 * publication et rien d'autre : le seul instant ou les treize points ont tous
 * produit leur matiere, donc le seul ou la page porte tous ses widgets. C'est
 * le bon arret pour une capture d'ecran, et le mauvais pour un film — on n'y
 * voit jamais un widget apparaitre, une checklist se remplir, un lot de
 * questions bloquer le run. On garde donc la meme matiere, et on la projette a
 * l'instant qu'on veut montrer.
 *
 * Projeter, c'est deux choses et elles vont ensemble :
 *
 * - le **journal** s'arrete au beat courant — les suivants n'ont pas eu lieu ;
 * - l'**etat** ne porte que ce que les beats passes ont produit. Un widget sans
 *   matiere n'est pas un widget vide, il n'existe pas : c'est deja la regle de
 *   l'etabli, il suffit de ne pas lui mentir sur la matiere.
 *
 * Le reste du fichier est la bande elle-meme, inchangee.
 */

/** Un moment du run, en minutes avant l'instant de reference. */
export interface Beat {
  /** Minutes avant maintenant. Strictement decroissant dans la liste. */
  readonly ago: number;
  readonly kind: string;
  readonly status: string;
  readonly step: string | null;
  readonly repo?: string;
  readonly agent?: string;
  readonly tool?: string;
  readonly title: string;
  readonly detail?: string;
  readonly payload?: Record<string, unknown>;
}

const check = (kind: string, passed: boolean, durationMs: number) => ({ check: { kind, passed, durationMs } });

export const beats: Beat[] = [
  // 1 — lecture du ticket
  { ago: 186, kind: "step", status: "start", step: "1", title: "Lecture du ticket FT-1042" },
  {
    ago: 185,
    kind: "tool",
    status: "ok",
    step: "1",
    tool: "get-jira-ticket",
    title: "Ticket lu — Story « Configuration des pondérations ALTAIR »",
    detail: "Statut Jira : En cours · 7 critères d'acceptation · 1 maquette référencée",
  },

  // 2 — maquettes
  { ago: 183, kind: "step", status: "start", step: "2", title: "Lecture des maquettes" },
  {
    ago: 182,
    kind: "tool",
    status: "ok",
    step: "2",
    tool: "get-figma-component",
    title: "Maquette rendue — LAB - pondération altair - popup opened",
    detail: "Dialog : 4 sliders, un total, deux boutons. Image rangée à côté de l'état du ticket.",
  },

  // 3 — memoire, tour large
  { ago: 180, kind: "step", status: "start", step: "3", title: "Mémoire, tour large" },
  { ago: 179, kind: "agent", status: "progress", step: "3", agent: "doc-scout", title: "Recherche sur le scoring ALTAIR" },
  {
    ago: 176,
    kind: "agent",
    status: "ok",
    step: "3",
    agent: "doc-scout",
    title: "3 notes lues — la mémoire ne dit rien du métier LAB",
    detail: "Rien sur le scoring ALTAIR, rien sur la pondération des critères.",
  },

  // 4 — questions fonctionnelles
  { ago: 174, kind: "step", status: "start", step: "4", title: "Questions fonctionnelles" },
  {
    ago: 173,
    kind: "question",
    status: "waiting",
    step: "4",
    agent: "functional-grill",
    title: "Déplacer un slider ajuste-t-il les trois autres ?",
    payload: {
      questions: [
        {
          key: "a",
          header: "Sliders",
          question: "Déplacer un slider ajuste-t-il automatiquement les trois autres pour tenir 100 % ?",
          options: ["Non, ils sont indépendants", "Oui, les autres se rééquilibrent"],
        },
      ],
    },
  },
  {
    ago: 171.5,
    kind: "answer",
    status: "ok",
    step: "4",
    agent: "functional-grill",
    title: "Réponse reçue (live) — les 4 sliders sont indépendants",
    payload: { transport: "live", answers: { a: "Non, ils sont indépendants" } },
  },
  {
    ago: 171,
    kind: "question",
    status: "waiting",
    step: "4",
    agent: "functional-grill",
    title: "Quand le score global de la feuille est-il recalculé ?",
    payload: {
      questions: [
        {
          key: "a",
          header: "Score",
          question: "Quand le score global affiché en haut de la feuille est-il recalculé ?",
          options: ["À l'enregistrement", "Pendant le réglage, en temps réel"],
        },
      ],
    },
  },
  {
    ago: 169.5,
    kind: "answer",
    status: "ok",
    step: "4",
    agent: "functional-grill",
    title: "Réponse reçue (live) — à l'enregistrement uniquement",
    payload: { transport: "live", answers: { a: "À l'enregistrement" } },
  },
  {
    ago: 169,
    kind: "question",
    status: "waiting",
    step: "4",
    agent: "functional-grill",
    title: "Qui a le droit de modifier les pondérations ?",
    payload: {
      questions: [
        {
          key: "a",
          header: "Droits",
          question: "Quels profils peuvent modifier les pondérations d'une feuille ?",
          options: ["Associé et Expert-comptable", "Tout profil ayant accès à la feuille"],
        },
      ],
    },
  },
  {
    ago: 167.5,
    kind: "answer",
    status: "ok",
    step: "4",
    agent: "functional-grill",
    title: "Réponse reçue (live) — Associé et Expert-comptable",
    payload: { transport: "live", answers: { a: "Associé et Expert-comptable" } },
  },
  {
    ago: 167,
    kind: "question",
    status: "waiting",
    step: "4",
    agent: "functional-grill",
    title: "Que devient un réglage abandonné en cours de route ?",
    payload: {
      questions: [
        {
          key: "a",
          header: "Abandon",
          question: "Que devient un réglage en cours si on ferme le panneau sans enregistrer ?",
          options: ["Il est perdu, sans confirmation", "Une confirmation est demandée"],
        },
      ],
    },
  },
  {
    ago: 165.5,
    kind: "answer",
    status: "ok",
    step: "4",
    agent: "functional-grill",
    title: "Réponse reçue (live) — perdu, sans confirmation",
    payload: { transport: "live", answers: { a: "Il est perdu, sans confirmation" } },
  },
  {
    ago: 165,
    kind: "question",
    status: "waiting",
    step: "4",
    agent: "functional-grill",
    title: "Un critère peut-il peser 0 % ?",
    payload: {
      questions: [
        {
          key: "a",
          header: "Zéro",
          question: "Un critère peut-il être ramené à 0 %, donc sortir du calcul ?",
          options: ["Oui, 0 est une valeur valide", "Non, le minimum est 5 %"],
        },
      ],
    },
  },
  {
    ago: 163.5,
    kind: "answer",
    status: "ok",
    step: "4",
    agent: "functional-grill",
    title: "Réponse reçue (live) — 0 est une valeur valide",
    payload: { transport: "live", answers: { a: "Oui, 0 est une valeur valide" } },
  },
  {
    ago: 163,
    kind: "question",
    status: "waiting",
    step: "4",
    agent: "functional-grill",
    title: "Les feuilles archivées sont-elles recalculées ?",
    payload: {
      questions: [
        {
          key: "a",
          header: "Archives",
          question: "Changer les pondérations recalcule-t-il le score des feuilles déjà archivées ?",
          options: ["Non, seules les feuilles actives", "Oui, tout l'historique est recalculé"],
        },
      ],
    },
  },
  {
    ago: 161.5,
    kind: "answer",
    status: "ok",
    step: "4",
    agent: "functional-grill",
    title: "Réponse reçue (live) — seules les feuilles actives",
    payload: { transport: "live", answers: { a: "Non, seules les feuilles actives" } },
  },
  {
    ago: 161,
    kind: "agent",
    status: "ok",
    step: "4",
    agent: "functional-grill",
    title: "Compréhension fonctionnelle complète — 6 arbitrages écrits",
  },

  // 5 — perimetre
  { ago: 159, kind: "step", status: "start", step: "5", title: "Périmètre des dépôts" },
  {
    ago: 158,
    kind: "agent",
    status: "progress",
    step: "5",
    agent: "scope-scout",
    title: "Exploration du code — recherche des poids ALTAIR",
  },
  {
    ago: 154,
    kind: "agent",
    status: "ok",
    step: "5",
    agent: "scope-scout",
    title: "Deux dépôts retenus — web-app-core (niveau 1), web-app (niveau 2)",
    detail: "web-app-core porte le schéma et le calcul, web-app porte la feuille et son bouton.",
  },

  // 6 — memoire, tour cible
  { ago: 152, kind: "step", status: "start", step: "6", title: "Mémoire, tour ciblé" },
  {
    ago: 151,
    kind: "agent",
    status: "progress",
    step: "6",
    agent: "doc-scout",
    title: "Lecture des notes des deux dépôts du scope",
  },
  {
    ago: 147,
    kind: "agent",
    status: "ok",
    step: "6",
    agent: "doc-scout",
    title: "7 notes lues — une contredite par le code",
    detail: "repos/web-app/conventions-tests.md annonce vitest ; package.json:31 dit rstest depuis janvier.",
  },

  // 7 — questions techniques
  { ago: 145, kind: "step", status: "start", step: "7", title: "Questions techniques" },
  {
    ago: 144,
    kind: "question",
    status: "waiting",
    step: "7",
    agent: "technical-grill",
    title: "Les pondérations vivent-elles sur la feuille ou sur le dossier ?",
    payload: {
      questions: [
        {
          key: "a",
          header: "Stockage",
          question: "Où vivent les pondérations : sur la feuille ou sur le dossier ?",
          options: ["Colonne weights JSONB sur lab_worksheet", "Table dédiée lab_weights"],
        },
      ],
    },
  },
  {
    ago: 142.5,
    kind: "answer",
    status: "ok",
    step: "7",
    agent: "technical-grill",
    title: "Réponse reçue (live) — colonne weights JSONB sur lab_worksheet",
    payload: { transport: "live", answers: { a: "Colonne weights JSONB sur lab_worksheet" } },
  },
  {
    ago: 142,
    kind: "question",
    status: "waiting",
    step: "7",
    agent: "technical-grill",
    title: "Où se calcule le score global aujourd'hui ?",
    payload: {
      questions: [
        {
          key: "a",
          header: "Calcul",
          question: "Où se calcule le score global aujourd'hui ?",
          options: ["Le back calcule et renvoie le score", "Le front recompose le score"],
        },
      ],
    },
  },
  {
    ago: 140.5,
    kind: "answer",
    status: "ok",
    step: "7",
    agent: "technical-grill",
    title: "Réponse reçue (live) — le back calcule et renvoie le score",
    payload: { transport: "live", answers: { a: "Le back calcule et renvoie le score" } },
  },
  {
    ago: 140,
    kind: "question",
    status: "waiting",
    step: "7",
    agent: "technical-grill",
    title: "Comment web-app consomme-t-il la nouvelle colonne ?",
    payload: {
      questions: [
        {
          key: "a",
          header: "Intégration",
          question: "Comment web-app récupère-t-il le contrat livré par web-app-core ?",
          options: ["Par le paquet versionné", "En lisant le dépôt en direct"],
        },
      ],
    },
  },
  {
    ago: 138.5,
    kind: "answer",
    status: "ok",
    step: "7",
    agent: "technical-grill",
    title: "Réponse reçue (live) — par le paquet versionné",
    payload: { transport: "live", answers: { a: "Par le paquet versionné" } },
  },
  {
    ago: 138,
    kind: "question",
    status: "waiting",
    step: "7",
    agent: "technical-grill",
    title: "Que vaut la colonne pour les feuilles déjà en base ?",
    payload: {
      questions: [
        {
          key: "a",
          header: "Existant",
          question: "Que vaut la nouvelle colonne pour les feuilles déjà en base ?",
          options: ["La migration écrit 30/30/25/15 partout", "NULL, et le calcul retombe sur les constantes"],
        },
      ],
    },
  },
  {
    ago: 136.5,
    kind: "answer",
    status: "ok",
    step: "7",
    agent: "technical-grill",
    title: "Réponse reçue (live) — la migration écrit 30/30/25/15 partout",
    payload: { transport: "live", answers: { a: "La migration écrit 30/30/25/15 partout" } },
  },
  {
    ago: 136,
    kind: "question",
    status: "waiting",
    step: "7",
    agent: "technical-grill",
    title: "Le total à 100 % est-il vérifié côté serveur ?",
    payload: {
      questions: [
        {
          key: "a",
          header: "Garde-fou",
          question: "Le total à 100 % est-il revérifié côté serveur, ou le front suffit-il ?",
          options: ["Oui, refusé à l'enregistrement", "Non, le front garantit déjà la règle"],
        },
      ],
    },
  },
  {
    ago: 134.5,
    kind: "answer",
    status: "ok",
    step: "7",
    agent: "technical-grill",
    title: "Réponse reçue (live) — refusé côté serveur hors 100 %",
    payload: { transport: "live", answers: { a: "Oui, refusé à l'enregistrement" } },
  },
  {
    ago: 134,
    kind: "question",
    status: "waiting",
    step: "7",
    agent: "technical-grill",
    title: "Comment les tests de composant simulent-ils les droits ?",
    payload: {
      questions: [
        {
          key: "a",
          header: "Tests",
          question: "Comment les tests de composant simulent-ils le profil de l'utilisateur ?",
          options: ["Par le contexte de session, comme le reste de la feuille", "Par un mock du hook de droits"],
        },
      ],
    },
  },
  {
    ago: 132.5,
    kind: "answer",
    status: "ok",
    step: "7",
    agent: "technical-grill",
    title: "Réponse reçue (live) — par le contexte de session",
    payload: { transport: "live", answers: { a: "Par le contexte de session, comme le reste de la feuille" } },
  },
  {
    ago: 132,
    kind: "agent",
    status: "ok",
    step: "7",
    agent: "technical-grill",
    title: "Compréhension technique complète — 6 arbitrages écrits",
  },

  // 8 — plan
  { ago: 130, kind: "step", status: "start", step: "8", title: "Plan et checklists de sortie" },
  {
    ago: 129,
    kind: "agent",
    status: "progress",
    step: "8",
    agent: "planner",
    title: "Écriture du plan, dépôt par dépôt, dans l'ordre des niveaux",
  },
  {
    ago: 124,
    kind: "plan",
    status: "ok",
    step: "8",
    agent: "planner",
    title: "Plan soumis — 2 dépôts, 6 critères de test, 4 critères de code",
    detail: "web-app-core au niveau 1, web-app au niveau 2 : le front dépend de la colonne livrée en amont.",
  },

  // 9 — approbation
  { ago: 122, kind: "step", status: "start", step: "9", title: "Approbation du plan" },
  {
    ago: 120,
    kind: "decision",
    status: "ok",
    step: "9",
    title: "Plan approuvé — sans amendement",
    detail: "Le contrat de sortie engage : 6 critères de test, 4 critères de code.",
  },

  // 10 — implementation, web-app-core
  { ago: 119, kind: "step", status: "start", step: "10", title: "Implémentation, dépôt par dépôt" },
  {
    ago: 118,
    kind: "agent",
    status: "progress",
    step: "10",
    repo: "web-app-core",
    agent: "orchestrator",
    title: "Worktree ouvert sur web-app-core",
  },
  {
    ago: 117,
    kind: "agent",
    status: "progress",
    step: "10.1",
    repo: "web-app-core",
    agent: "test-writer",
    title: "Écriture des tests avant toute implémentation",
  },
  {
    ago: 112,
    kind: "agent",
    status: "ok",
    step: "10.1",
    repo: "web-app-core",
    agent: "test-writer",
    title: "6 tests écrits — migration, valeurs par défaut, isolation entre feuilles",
  },
  {
    ago: 111,
    kind: "agent",
    status: "ok",
    step: "10.2",
    repo: "web-app-core",
    agent: "test-adversary",
    title: "Checklist tests : 6 lignes relues, aucune contestée",
  },
  {
    ago: 110,
    kind: "loop",
    status: "progress",
    step: "10.2",
    repo: "web-app-core",
    agent: "orchestrator",
    title: "Boucle tests web-app-core : 1 tour",
    payload: { name: "tests web-app-core", count: 1, budget: 3 },
  },
  {
    ago: 109,
    kind: "agent",
    status: "ok",
    step: "10.3",
    repo: "web-app-core",
    agent: "red-checker",
    title: "Les 6 tests échouent — sur assertion, aucun sur import",
  },
  {
    ago: 108,
    kind: "todo",
    status: "progress",
    step: "10.4",
    repo: "web-app-core",
    agent: "developer",
    title: "Todo du developer mise à jour",
    payload: {
      items: [
        { text: "Ajouter la colonne weights JSONB sur lab_worksheet", status: "completed" },
        { text: "Écrire la migration réversible avec son down", status: "completed" },
        { text: "Sortir les quatre poids des constantes de score.ts", status: "completed" },
      ],
    },
  },
  {
    ago: 103,
    kind: "tool",
    status: "progress",
    step: "10.4",
    repo: "web-app-core",
    agent: "developer",
    title: "Commit — la colonne, la migration et le calcul",
    payload: {
      commit: {
        files: [
          { path: "migrations/0149_lab_worksheet_weights.sql", added: 34, removed: 0 },
          { path: "src/lab/score.ts", added: 21, removed: 14 },
          { path: "src/lab/weights.ts", added: 48, removed: 0 },
        ],
      },
    },
  },
  {
    ago: 101,
    kind: "tool",
    status: "ok",
    step: "10.5",
    repo: "web-app-core",
    agent: "green-checker",
    title: "Vérification ut — passe",
    payload: check("ut", true, 4120),
  },
  {
    ago: 100,
    kind: "tool",
    status: "ok",
    step: "10.5",
    repo: "web-app-core",
    agent: "green-checker",
    title: "Vérification it — passe",
    payload: check("it", true, 11830),
  },
  {
    ago: 99,
    kind: "tool",
    status: "ok",
    step: "10.5",
    repo: "web-app-core",
    agent: "green-checker",
    title: "Vérification lint — passe",
    payload: check("lint", true, 2240),
  },
  {
    ago: 98,
    kind: "tool",
    status: "ok",
    step: "10.5",
    repo: "web-app-core",
    agent: "green-checker",
    title: "Vérification typecheck — passe",
    payload: check("typecheck", true, 6510),
  },
  {
    ago: 96,
    kind: "agent",
    status: "ko",
    step: "10.6",
    repo: "web-app-core",
    agent: "code-adversary",
    title: "Checklist code : 1 ligne rejetée sur 4",
    detail: "Le down de la migration supprime la colonne sans restaurer les valeurs par défaut.",
  },
  {
    ago: 95,
    kind: "loop",
    status: "progress",
    step: "10.6",
    repo: "web-app-core",
    agent: "orchestrator",
    title: "Boucle code web-app-core : 2 tours",
    payload: { name: "code web-app-core", count: 2, budget: 3 },
  },
  {
    ago: 93,
    kind: "tool",
    status: "progress",
    step: "10.4",
    repo: "web-app-core",
    agent: "developer",
    title: "Commit — le down restaure 30 / 30 / 25 / 15",
    payload: {
      commit: {
        files: [{ path: "migrations/0149_lab_worksheet_weights.sql", added: 9, removed: 2 }],
      },
    },
  },
  {
    ago: 91,
    kind: "tool",
    status: "ok",
    step: "10.5",
    repo: "web-app-core",
    agent: "green-checker",
    title: "Vérification it — passe",
    payload: check("it", true, 12040),
  },
  {
    ago: 90,
    kind: "agent",
    status: "ok",
    step: "10.6",
    repo: "web-app-core",
    agent: "code-adversary",
    title: "Checklist code : 4 lignes sur 4, avec preuve",
  },
  {
    ago: 89,
    kind: "agent",
    status: "ok",
    step: "10.7",
    repo: "web-app-core",
    agent: "orchestrator",
    title: "web-app-core publié en amont — tag ft-1042-demo.1, pipeline verte",
  },

  // 10 — implementation, web-app
  {
    ago: 87,
    kind: "agent",
    status: "progress",
    step: "10",
    repo: "web-app",
    agent: "orchestrator",
    title: "Worktree ouvert sur web-app",
  },
  {
    ago: 86,
    kind: "agent",
    status: "ok",
    step: "10.1",
    repo: "web-app",
    agent: "test-writer",
    title: "8 tests écrits — 4 composants, 4 unitaires",
  },
  {
    ago: 84,
    kind: "agent",
    status: "ok",
    step: "10.2",
    repo: "web-app",
    agent: "test-adversary",
    title: "Checklist tests : 8 lignes relues, aucune contestée",
  },
  {
    ago: 83,
    kind: "loop",
    status: "progress",
    step: "10.2",
    repo: "web-app",
    agent: "orchestrator",
    title: "Boucle tests web-app : 1 tour",
    payload: { name: "tests web-app", count: 1, budget: 3 },
  },
  {
    ago: 82,
    kind: "agent",
    status: "ok",
    step: "10.3",
    repo: "web-app",
    agent: "red-checker",
    title: "Les 8 tests échouent — sur assertion, aucun sur mock",
  },
  {
    ago: 81,
    kind: "todo",
    status: "progress",
    step: "10.4",
    repo: "web-app",
    agent: "developer",
    title: "Todo du developer mise à jour",
    payload: {
      items: [
        { text: "Panneau modal avec les quatre sliders", status: "completed" },
        { text: "Total en vert à 100 %, en rouge sinon", status: "completed" },
        { text: "Désactiver Enregistrer hors 100 %", status: "completed" },
        { text: "Bouton Rétablir les valeurs par défaut", status: "completed" },
      ],
    },
  },
  {
    ago: 72,
    kind: "tool",
    status: "progress",
    step: "10.4",
    repo: "web-app",
    agent: "developer",
    title: "Commit — le panneau, le total et le recalcul",
    payload: {
      commit: {
        files: [
          { path: "src/features/lab/PonderationsDialog.tsx", added: 186, removed: 0 },
          { path: "src/features/lab/Worksheet.tsx", added: 12, removed: 3 },
          { path: "src/features/lab/use-ponderations.ts", added: 64, removed: 0 },
          { path: "src/features/lab/score-badge.tsx", added: 7, removed: 5 },
        ],
      },
    },
  },
  {
    ago: 68,
    kind: "tool",
    status: "ok",
    step: "10.5",
    repo: "web-app",
    agent: "green-checker",
    title: "Vérification ut — passe",
    payload: check("ut", true, 8940),
  },
  {
    ago: 66,
    kind: "tool",
    status: "ok",
    step: "10.5",
    repo: "web-app",
    agent: "green-checker",
    title: "Vérification ct — passe",
    payload: check("ct", true, 42300),
  },
  {
    ago: 65,
    kind: "tool",
    status: "ok",
    step: "10.5",
    repo: "web-app",
    agent: "green-checker",
    title: "Vérification lint — passe",
    payload: check("lint", true, 3100),
  },
  {
    ago: 64,
    kind: "tool",
    status: "ok",
    step: "10.5",
    repo: "web-app",
    agent: "green-checker",
    title: "Vérification typecheck — passe",
    payload: check("typecheck", true, 9870),
  },
  {
    ago: 62,
    kind: "loop",
    status: "progress",
    step: "10.6",
    repo: "web-app",
    agent: "orchestrator",
    title: "Boucle code web-app : 1 tour",
    payload: { name: "code web-app", count: 1, budget: 3 },
  },
  {
    ago: 61,
    kind: "agent",
    status: "ok",
    step: "10.6",
    repo: "web-app",
    agent: "code-adversary",
    title: "Checklist code : 4 lignes sur 4, avec preuve",
  },
  {
    ago: 59,
    kind: "agent",
    status: "ok",
    step: "10.7",
    repo: "web-app",
    agent: "orchestrator",
    title: "web-app publié en amont — pipeline verte sur les deux dépôts",
  },

  // 11 — plan memoire
  { ago: 57, kind: "step", status: "start", step: "11", title: "Plan de capitalisation mémoire" },
  {
    ago: 56,
    kind: "agent",
    status: "progress",
    step: "11",
    agent: "memory-planner",
    title: "Traitement de la contradiction relevée au tour ciblé",
  },
  {
    ago: 52,
    kind: "agent",
    status: "ok",
    step: "11",
    agent: "memory-planner",
    title: "4 opérations planifiées — 2 créations, 1 mise à jour, 1 suppression",
  },

  // 12 — ecriture memoire
  { ago: 50, kind: "step", status: "start", step: "12", title: "Écriture de la mémoire" },
  {
    ago: 49,
    kind: "agent",
    status: "progress",
    step: "12",
    agent: "memory-writer",
    title: "Application du plan mémoire, à la lettre",
  },
  {
    ago: 46,
    kind: "agent",
    status: "ok",
    step: "12",
    agent: "memory-writer",
    title: "Mémoire commitée — memory: FT-1042-demo",
  },

  // 13 — publication
  { ago: 7, kind: "step", status: "start", step: "13", title: "Publication : une MR par dépôt, un canal, une transition" },
  {
    ago: 5,
    kind: "agent",
    status: "progress",
    step: "13",
    agent: "finalizer",
    title: "Branches poussées sur les deux dépôts",
  },
  {
    ago: 3,
    kind: "agent",
    status: "progress",
    step: "13",
    agent: "finalizer",
    title: "MR web-app-core!482 ouverte",
    detail: "feat(lab): pondérations ALTAIR réglables par feuille",
  },
  {
    ago: 1.5,
    kind: "agent",
    status: "progress",
    step: "13",
    agent: "finalizer",
    title: "MR web-app!1177 ouverte, croisée avec web-app-core!482",
  },
  {
    ago: 0.6,
    kind: "agent",
    status: "progress",
    step: "13",
    agent: "finalizer",
    title: "Canal #ft-1042-ponderations-altair ouvert, 3 personnes invitées",
  },
];

/**
 * L'horloge de la projection.
 *
 * Un beat est date en minutes avant un instant de reference. La bande couvre
 * trois heures de run ; une capture en couvre deux minutes. Les deux ne peuvent
 * pas suivre la meme horloge, et c'est le direct qui doit ceder : le bandeau
 * affiche « depuis 8 m » en comparant l'horodatage a l'heure du navigateur, et
 * un event date dans le futur y afficherait une duree negative.
 *
 * On coupe donc la bande en deux. Ce qui precede l'instant montre est **du
 * passe** : il garde son espacement d'origine, une minute de run vaut une
 * minute, et le run a l'age qu'il doit avoir. Ce qui se joue **pendant** la
 * capture est estampille a l'heure ou il part sur le fil — les minutes de
 * fiction entre deux beats sont perdues, et c'est exactement ce qu'on demande a
 * un time-lapse.
 */
export interface Clock {
  /** L'horodatage ISO d'un beat, passe ou joue. */
  readonly tsOf: (ago: number) => string;
  /** Fige un beat a l'heure reelle ou il vient de partir sur le fil. */
  readonly play: (ago: number, atMs?: number) => string;
}

export function makeClock(cutAgo: number, originMs: number = Date.now(), tailAgo = 0.5): Clock {
  /** Ce qu'il faut retrancher pour que le beat de coupe tombe a `tailAgo`. */
  const shift = cutAgo - tailAgo;
  const played = new Map<number, string>();

  const tsOf = (ago: number): string =>
    played.get(ago) ?? new Date(originMs - (ago - shift) * 60_000).toISOString();

  const play = (ago: number, atMs: number = Date.now()): string => {
    const ts = new Date(atMs).toISOString();
    played.set(ago, ts);
    return ts;
  };

  return { tsOf, play };
}

/** Le beat a-t-il eu lieu a l'instant projete ? */
const before = (cutAgo: number) => (ago: number) => ago >= cutAgo;

export interface Projection {
  readonly events: readonly Record<string, unknown>[];
  readonly state: Record<string, unknown>;
}

/**
 * Les points ou chaque morceau de l'etat est produit.
 *
 * Ecrits ici plutot qu'au milieu de l'etat : c'est la table qui dit a quel
 * moment un widget apparait, et on la lit d'un coup d'oeil quand on cale une
 * scene sur un moment du run.
 */
export const PRODUCED = {
  enonce: 185,
  maquette: 182,
  scoutLarge: 176,
  functional: [170, 166, 162],
  scope: 154,
  scoutCiblee: 147,
  plan: 124,
  approved: 120,
  coreDone: 89,
  myuDone: 59,
  memoryOps: 52,
  memoryCommit: 46,
  mrCore: 3,
  mrMyu: 1.5,
  slack: 0.6,
} as const;

/**
 * Les moments qu'une capture sait montrer.
 *
 * `cut` est le `ago` du premier beat **non** joue : la projection s'arrete
 * juste avant lui, et c'est de la que le direct repart. Les nommer ici evite
 * qu'une scene du film aille chercher un nombre au milieu de la bande.
 */
export const MOMENTS = {
  /** Le ticket lu, la maquette rangee. Le run vient de demarrer. */
  ouverture: 180,
  /** Le point 4 s'ouvre : le premier lot de questions va bloquer le run. */
  cadrage: 174,
  /** Les trois arbitrages fonctionnels sont poses, le perimetre se cherche. */
  perimetre: 159,
  /** Le plan est ecrit, il attend le gate humain. */
  plan: 122,
  /** Le plan est approuve, le premier depot ouvre son worktree. */
  implementation: 119,
  /** Les deux depots sont verts, la memoire se capitalise. */
  memoire: 57,
  /** La publication, en cours : tous les widgets sont la. */
  publication: 0,
} as const;

export type MomentName = keyof typeof MOMENTS;

/**
 * Le run, projete a un instant.
 *
 * `cutAgo` a 0 rend la bande entiere — c'est la publication, et c'est ce que le
 * seed ecrit quand on ne lui demande rien.
 */
export function project({
  ticketId,
  runId,
  cutAgo = 0,
  clock,
}: {
  readonly ticketId: string;
  readonly runId: string;
  readonly cutAgo?: number;
  readonly clock: Clock;
}): Projection {
  const done = before(cutAgo);
  const at = clock.tsOf;
  const kept = beats.filter((beat) => done(beat.ago));

  const events = kept.map((beat, seq) => ({
    runId,
    ticketId,
    seq,
    ts: at(beat.ago),
    kind: beat.kind,
    status: beat.status,
    repo: beat.repo ?? null,
    agent: beat.agent ?? null,
    tool: beat.tool ?? null,
    step: beat.step,
    title: beat.title,
    detail: beat.detail ?? null,
    payload: beat.payload ?? {},
  }));

  const last = kept.at(-1) ?? beats[0];

  /** Ne garder que ce qui a ete produit, et dans l'ordre de production. */
  const upTo = <T extends { readonly producedAt: number }>(entries: readonly T[]): T[] =>
    entries.filter((entry) => done(entry.producedAt));
  /** Le meme, debarrasse du marqueur de production avant d'aller au YAML. */
  const strip = <T extends { readonly producedAt: number }>(entries: readonly T[]): Omit<T, "producedAt">[] =>
    upTo(entries).map(({ producedAt: _producedAt, ...rest }) => rest);

  const state = buildState({ ticketId, runId, at, done, last, strip });
  return { events, state };
}

/**
 * Le nom de la phase, deduit du point courant.
 *
 * Il ne commande aucun widget — la page se cale sur `run.step`. Il n'existe que
 * pour que l'etat sur disque se lise seul, sans compter les points sur ses
 * doigts.
 */
function phaseOf(step: string): string {
  const top = Number.parseInt(String(step), 10);
  if (top <= 2) return "lecture";
  if (top <= 7) return "cadrage";
  if (top <= 9) return "plan";
  if (top <= 10) return "implementation";
  if (top <= 12) return "memoire";
  return "publication";
}

function buildState({
  ticketId,
  runId,
  at,
  done,
  last,
  strip,
}: {
  readonly ticketId: string;
  readonly runId: string;
  readonly at: (ago: number) => string;
  readonly done: (ago: number) => boolean;
  readonly last: Beat;
  readonly strip: <T extends { readonly producedAt: number }>(entries: readonly T[]) => Omit<T, "producedAt">[];
}): Record<string, unknown> {
  const P = PRODUCED;

  const functional = strip([
    {
      producedAt: P.functional[0],
      at: at(P.functional[0]),
      question: "Déplacer un slider ajuste-t-il automatiquement les trois autres critères pour maintenir le total à 100 % ?",
      answer: "Non. Les 4 sliders sont totalement indépendants ; c'est à l'utilisateur de ramener lui-même le total à 100 %.",
      why: "Confirmé par le scénario 1, où le total monte librement à 110 % avant d'être rattrapé à la main sur un autre critère.",
    },
    {
      producedAt: P.functional[1],
      at: at(P.functional[1]),
      question: "Quand le score global affiché en haut de la feuille est-il recalculé ?",
      answer: "À l'enregistrement uniquement. Tant que la modale n'est pas validée, le score de la feuille ne bouge pas.",
      why: "Lève la contradiction entre le scénario 1 et le TNR 1 : « temps réel » y signifie sans rechargement de page après l'enregistrement, pas pendant le déplacement des sliders.",
    },
    {
      producedAt: P.functional[2],
      at: at(P.functional[2]),
      question: "Quels profils peuvent modifier les pondérations d'une feuille ?",
      answer: "Associé et Expert-comptable. Les autres profils voient le panneau en lecture seule.",
      why: "Le critère d'acceptation ne nomme que ces deux profils, et la maquette montre le panneau sans bouton pour les autres — il fallait trancher entre cacher et désactiver.",
    },
  ]);

  const technical = strip([
    {
      producedAt: 141,
      at: at(141),
      question: "Les pondérations vivent-elles sur la feuille ou sur le dossier ?",
      answer: "Sur la feuille. Une colonne `weights` en JSONB sur `lab_worksheet`, pas de table dédiée.",
      why: "L'isolation entre feuilles est un critère d'acceptation ; une table partagée la rendrait accidentelle plutôt que structurelle.",
    },
    {
      producedAt: 137,
      at: at(137),
      question: "Où se calcule le score global aujourd'hui ?",
      answer: "Dans web-app-core. Le back calcule et renvoie le score ; le front ne fait que l'afficher.",
      why: "Recalculer côté front aurait dupliqué la règle ALTAIR dans deux dépôts, avec deux vérités possibles pour un même score.",
    },
    {
      producedAt: 133,
      at: at(133),
      question: "Comment web-app récupère-t-il le contrat livré par web-app-core ?",
      answer: "Par le paquet versionné. web-app-core est publié en amont, puis web-app bump sa dépendance.",
      why: "C'est ce que dit la note integrations/web-app-core-vers-web-app.md, et c'est ce qui impose l'ordre des niveaux dans le plan.",
    },
  ]);

  /**
   * Une checklist se remplit ligne par ligne, et chaque ligne a son moment.
   *
   * C'est le seul widget qu'on vient regarder pendant que le cycle tourne : le
   * figer tout au vert le vide de ce qu'il sert a montrer. Chaque critere passe
   * quand l'adversaire du depot qui le porte l'a valide.
   */
  const testLines = [
    { producedAt: 64, id: "T1", criterion: "Le panneau s'ouvre depuis le bouton Pondérations" },
    { producedAt: 64, id: "T2", criterion: "Les 4 sliders vont de 0 à 100 par pas de 5" },
    { producedAt: 64, id: "T3", criterion: "Le total passe en rouge hors 100 %" },
    { producedAt: 64, id: "T4", criterion: "Enregistrer est désactivé hors 100 %" },
    { producedAt: 98, id: "T5", criterion: "Changer une feuille n'affecte pas les autres" },
    { producedAt: 98, id: "T6", criterion: "Rétablir remet 30/30/25/15" },
  ];
  const codeLines = [
    { producedAt: 90, id: "C1", criterion: "Migration réversible sur lab_worksheet" },
    { producedAt: 61, id: "C2", criterion: "Aucun recalcul de score pendant le réglage" },
    { producedAt: 90, id: "C3", criterion: "Droits Associé / Expert-comptable vérifiés côté serveur" },
    { producedAt: 61, id: "C4", criterion: "Pas de valeur de pondération codée en dur côté front" },
  ];
  const line = ({ producedAt, id, criterion }: { producedAt: number; id: string; criterion: string }) => ({
    id,
    criterion,
    status: done(producedAt) ? "passed" : "pending",
  });

  const scoped = done(P.scope);
  const repos = [
    {
      repo: "web-app-core",
      level: 1,
      status: done(P.coreDone) ? "done" : done(119) ? "running" : "pending",
      area: "back",
      reason: "Porte le schéma de lab_worksheet et le calcul du score ALTAIR.",
      evidence: [
        "src/lab/score.ts:42 — les quatre poids sont des constantes du module",
        "migrations/0148_lab_worksheet.sql:12 — la table qui recevra la colonne",
      ],
      loops: { tests: done(110) ? 1 : 0, code: done(95) ? 2 : done(96) ? 1 : 0 },
      commits: [...(done(103) ? ["a1b2c3d"] : []), ...(done(93) ? ["e4f5a6b"] : [])],
      tags: done(P.coreDone) ? ["ft-1042-demo.1"] : [],
    },
    {
      repo: "web-app",
      level: 2,
      status: done(P.myuDone) ? "done" : done(87) ? "running" : "pending",
      area: "front",
      reason: "Porte la feuille LAB et le bouton qui ouvre le panneau.",
      evidence: [
        "src/features/lab/Worksheet.tsx:210 — la barre d'actions de la feuille",
        "src/features/lab/score-badge.tsx:18 — le score affiché en haut",
      ],
      loops: { tests: done(83) ? 1 : 0, code: done(62) ? 1 : 0 },
      commits: done(72) ? ["7c8d9e0"] : [],
      tags: [],
    },
  ];

  const scouted = strip([
    {
      producedAt: P.scoutLarge,
      pass: "large",
      at: at(P.scoutLarge),
      filesRead: 3,
      notes: [] as { path: string; says: string }[],
      silentOn: [
        "Rien sur le scoring ALTAIR ni sur la pondération des critères",
        "Rien sur le métier LAB en général",
      ],
    },
    {
      producedAt: P.scoutCiblee,
      pass: "ciblee",
      at: at(P.scoutCiblee),
      filesRead: 7,
      notes: [
        {
          path: "repos/web-app/conventions-tests.md",
          says: "Le repo tourne sous rstest, pas vitest — le fichier le dit encore faux",
        },
        {
          path: "repos/web-app-core/migrations.md",
          says: "Une migration doit être réversible et porter son down, sans exception",
        },
        {
          path: "integrations/web-app-core-vers-web-app.md",
          says: "web-app consomme web-app-core par un paquet versionné, jamais en direct",
        },
      ],
      silentOn: ["Rien sur les colonnes JSONB dans web-app-core"],
    },
  ]);

  const operations = strip([
    {
      producedAt: P.memoryOps,
      op: "create",
      path: "features/lab/ponderations-altair.md",
      why: "Les quatre critères, leurs valeurs par défaut, et le fait que le total doit valoir 100 %.",
    },
    {
      producedAt: P.memoryOps,
      op: "create",
      path: "repos/web-app-core/colonnes-jsonb.md",
      why: "Première colonne JSONB du repo — la convention n'existait pas.",
    },
    {
      producedAt: P.memoryOps,
      op: "update",
      path: "repos/web-app/conventions-tests.md",
      why: "Corrige la contradiction relevée au tour ciblé : le runner est rstest.",
    },
    {
      producedAt: P.memoryOps,
      op: "delete",
      path: "repos/web-app/vitest-setup.md",
      why: "Décrit un runner que le repo n'utilise plus depuis janvier.",
    },
  ]);

  const mergeRequests = strip([
    {
      producedAt: P.mrCore,
      repo: "web-app-core",
      iid: 482,
      url: "https://gitlab.example.com/web-app-core/-/merge_requests/482",
    },
    {
      producedAt: P.mrMyu,
      repo: "web-app",
      iid: 1177,
      url: "https://gitlab.example.com/web-app/-/merge_requests/1177",
    },
  ]);

  /** Chaque reponse et chaque decision est une main humaine posee sur le run. */
  const interventions = [...P.functional, 141, 137, 133, P.approved].filter(done).length;
  const loopTurns = [110, 95, 83, 62].filter(done).length + (done(95) ? 1 : 0);

  return {
    schemaVersion: 1,
    ticket: {
      key: ticketId,
      squad: "FT",
      type: "Story",
      title: "Configuration des pondérations ALTAIR",
      slug: "configuration-ponderations-altair",
      url: "https://your-org.atlassian.net/browse/FT-1042",
      statusAtStart: "En cours",
      notes: null,
      description: [
        "Les cabinets doivent pouvoir régler eux-mêmes le poids des quatre critères",
        "ALTAIR utilisés pour calculer le score de risque d'une feuille LAB.",
        "",
        "Aujourd'hui les pondérations sont figées dans le code (Client 30, Activité 30,",
        "Localisation 25, Mission 15) et un changement demande une livraison. On ouvre",
        "un panneau modal depuis la feuille, avec un slider et un champ numérique",
        "synchronisés par critère.",
        "",
        "Le total doit valoir exactement 100 %. Tant que ce n'est pas le cas, le bouton",
        "Enregistrer reste désactivé et le total s'affiche en rouge. Les pondérations",
        "sont propres à chaque feuille : en changer une n'affecte aucune autre.",
      ].join("\n"),
      acceptanceCriteria: [
        "- Le panneau s'ouvre depuis le bouton « Pondérations » de la feuille LAB",
        "- Les 4 sliders sont indépendants et vont de 0 à 100 par pas de 5",
        "- Le total s'affiche en vert à 100 %, en rouge sinon",
        "- Le bouton Enregistrer est désactivé tant que le total n'est pas à 100 %",
        "- Le score de la feuille est recalculé à l'enregistrement, pas pendant le réglage",
        "- Un bouton « Rétablir les valeurs par défaut » remet 30 / 30 / 25 / 15",
        "- Seuls les profils Associé et Expert-comptable peuvent modifier",
      ].join("\n"),
    },
    figmaOverrides: [],
    run: {
      phase: phaseOf(last.step ?? "1"),
      step: last.step ?? "1",
      currentRepo: last.repo ?? null,
      liveRunId: runId,
      startedAt: at(186),
      updatedAt: at(last.ago),
      escalation: null,
    },
    figma: {
      urls: done(P.maquette)
        ? ["https://www.figma.com/design/B1jMlMeyMLYtBt6vy4pmxL/FT-643-Loi-Anti-Blanchiment-assistee-par-IA?node-id=7155-19416&m=dev"]
        : [],
      frames: done(P.maquette)
        ? [
            {
              url: "https://www.figma.com/design/B1jMlMeyMLYtBt6vy4pmxL/FT-643-Loi-Anti-Blanchiment-assistee-par-IA?node-id=7155-19416&m=dev",
              fileKey: "B1jMlMeyMLYtBt6vy4pmxL",
              nodeId: "7155:19416",
              name: "LAB - pondération altair - popup opened",
              image: "7155-19416.png",
              outline: [
                "- LAB - pondération altair - popup opened [FRAME]",
                "  - Dialog [FRAME]",
                "    - Title [TEXT]",
                "    - content [FRAME]",
                "      - slider-client [INSTANCE]",
                "      - slider-activite [INSTANCE]",
                "      - slider-localisation [INSTANCE]",
                "      - slider-mission [INSTANCE]",
                "      - total [TEXT]",
                "    - buttons [FRAME]",
              ],
            },
          ]
        : [],
    },
    arbitrages: { functional, technical },
    plan: done(P.plan)
      ? {
          approvedAt: done(P.approved) ? at(P.approved) : null,
          content: null,
          repos: [
            {
              repo: "web-app-core",
              level: 1,
              changes: [
                "Colonne weights JSONB sur lab_worksheet",
                "Migration réversible + valeurs par défaut 30/30/25/15",
                "Les quatre poids sortent des constantes de score.ts",
              ],
              why: "Le socle porte le schéma et le calcul ; web-app le consomme par le paquet versionné.",
            },
            {
              repo: "web-app",
              level: 2,
              changes: [
                "Panneau modal de pondération, ouvert depuis la feuille",
                "Total en vert à 100 %, en rouge sinon, Enregistrer désactivé hors 100 %",
                "Recalcul du score à l'enregistrement",
              ],
              why: "Le front dépend de la colonne livrée par web-app-core, il passe donc après.",
            },
          ],
          checklists: { tests: testLines.map(line), code: codeLines.map(line) },
        }
      : { approvedAt: null, content: null, repos: [], checklists: { tests: [], code: [] } },
    scope: scoped ? repos : [],
    memory: {
      contradictions: done(P.scoutCiblee)
        ? [
            {
              note: "repos/web-app/conventions-tests.md",
              claim: "Le repo web-app tourne sous vitest",
              detail: "package.json:31 — le runner est rstest depuis le bump de janvier",
              verdict: "Faux",
              raisedBy: "doc-scout",
              at: at(P.scoutCiblee),
            },
          ]
        : [],
      scouted,
      operations,
      commit: done(P.memoryCommit) ? "9f3ac71d4e8b2c05a6f1" : null,
    },
    publication: {
      mergeRequests,
      slackChannel: done(P.slack)
        ? {
            id: "C0FT1426DEMO",
            name: "ft-1042-ponderations-altair",
            invited: ["dev.lead", "reviewer.back", "reviewer.front"],
          }
        : null,
      jiraTransition: { to: null, at: null },
    },
    metrics: {
      humanInterventions: interventions,
      loopTurnsTotal: loopTurns,
      mrFeedbackCount: null,
    },
    workflow2: { feedback: [], lastScannedAt: null, archivedAt: null },
  };
}
