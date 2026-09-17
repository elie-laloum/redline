/**
 * Lecture tolerante de l'etat du ticket.
 *
 * Le fichier est ecrit par des agents, en merge/patch, et il a deja derive de
 * ce que le squelette annonce : `scope[].repo` la ou le type disait `name`,
 * `run.step` en nombre la ou le code attendait une chaine, des contradictions
 * avec leur propre forme. Le shell ne pilote rien et n'a aucun moyen d'imposer
 * un schema — il lit ce qui est la, et ce qu'il ne comprend pas ne casse pas la
 * page.
 */

export interface RunState {
  readonly phase: string | null;
  readonly step: string;
  readonly currentRepo: string | null;
  readonly startedAt: string | null;
  readonly escalation: Escalation | null;
}

export interface Escalation {
  readonly at: string;
  readonly step: string;
  readonly repo: string | null;
  readonly reason: string;
}

export interface RepoEntry {
  readonly name: string;
  readonly level: number | null;
  readonly status: string;
  readonly area: string | null;
  /** Pourquoi ce depot est retenu, en une phrase. */
  readonly reason: string | null;
  /** Les preuves localisees, sous la forme `fichier:ligne — ce qu'on y voit`. */
  readonly evidence: readonly string[];
  readonly loops: ReadonlyMap<string, number>;
  readonly commits: readonly string[];
}

export interface Arbitrage {
  readonly at: string | null;
  readonly question: string;
  readonly answer: string;
  readonly why: string | null;
}

export interface ChecklistLine {
  readonly id: string;
  readonly criterion: string;
  readonly status: string;
}

export interface Contradiction {
  readonly note: string;
  /** Selon l'agent : `claim` + `evidence`, ou `verdict` + `detail`. Les deux passent. */
  readonly claim: string | null;
  readonly detail: string | null;
  readonly verdict: string | null;
  readonly raisedBy: string | null;
  readonly at: string | null;
}

/**
 * Une maquette, telle que le run l'a lue.
 *
 * `image` est un nom de fichier, pas une URL Figma : le PNG a ete tire au point
 * 2 et range a cote de l'etat du ticket. Une URL de rendu Figma expire en
 * quelques dizaines de minutes, et le lien du fichier demande un jeton que le
 * navigateur n'a pas — un run relu trois semaines plus tard montrerait un cadre
 * vide a la place de la maquette sur laquelle il a ete cadre.
 */
export interface FigmaFrame {
  readonly url: string;
  readonly nodeId: string | null;
  readonly name: string | null;
  readonly image: string | null;
  readonly outline: readonly string[];
}

/** Une note que le doc-scout a retenue, et ce qu'il en a tire. */
export interface ScoutedNote {
  readonly path: string;
  readonly says: string | null;
}

/**
 * Un passage du doc-scout.
 *
 * Il y en a deux et ils ne se fusionnent pas : le tour large cherche le sujet
 * du ticket sans connaitre les depots, le tour cible ne lit que les depots
 * retenus. Les confondre ferait croire que la memoire a ete lue une fois.
 */
export interface MemoryScout {
  readonly pass: "large" | "ciblee";
  readonly at: string | null;
  readonly filesRead: number | null;
  readonly notes: readonly ScoutedNote[];
  /** Ce sur quoi la memoire est muette. Compte autant que ce qu'elle dit. */
  readonly silentOn: readonly string[];
}

export type MemoryOp = "create" | "update" | "delete";

/** Ce que le memory-writer a applique au point 12. */
export interface MemoryOperation {
  readonly op: MemoryOp;
  readonly path: string;
  readonly why: string | null;
}

export interface Metrics {
  readonly humanInterventions: number | null;
  readonly loopTurnsTotal: number | null;
  readonly mrFeedbackCount: number | null;
}

export interface Ticket {
  readonly key: string | null;
  readonly title: string | null;
  readonly url: string | null;
  readonly jiraStatus: string | null;
  readonly type: string | null;
  /** L'enonce, tel que le run l'a lu. Jira n'est pas rappele depuis la page. */
  readonly description: string | null;
  readonly acceptanceCriteria: string | null;
  /** Les maquettes referencees, meme celles qu'on n'a pas su lire. */
  readonly figmaUrls: readonly string[];
  readonly figmaFrames: readonly FigmaFrame[];
  readonly scouted: readonly MemoryScout[];
  readonly memoryOperations: readonly MemoryOperation[];
  readonly memoryCommit: string | null;
  readonly run: RunState;
  readonly scope: readonly RepoEntry[];
  readonly functional: readonly Arbitrage[];
  readonly technical: readonly Arbitrage[];
  readonly tests: readonly ChecklistLine[];
  readonly code: readonly ChecklistLine[];
  readonly contradictions: readonly Contradiction[];
  readonly metrics: Metrics;
  readonly planApprovedAt: string | null;
  /** Le plan du point 8, depot par depot, dans l'ordre d'execution. */
  readonly planRepos: readonly PlanRepoEntry[];
}

/**
 * Un depot dans le plan.
 *
 * Il double `PlanRepo` du flux d'events, et c'est voulu : celui-ci vient du
 * fichier d'etat, qui survit au shell, l'autre du lot en attente. Ils portent la
 * meme chose a deux moments differents, et les confondre ferait afficher un plan
 * deja approuve comme un plan qui attend.
 */
export interface PlanRepoEntry {
  readonly repo: string;
  readonly level: number | null;
  readonly changes: readonly string[];
  readonly why: string | null;
}

export const EMPTY_TICKET: Ticket = {
  key: null,
  title: null,
  url: null,
  jiraStatus: null,
  type: null,
  description: null,
  acceptanceCriteria: null,
  figmaUrls: [],
  figmaFrames: [],
  scouted: [],
  memoryOperations: [],
  memoryCommit: null,
  run: {
    phase: null,
    // Sans fichier d'etat, on ne connait aucune etape — pas meme la premiere.
    // Annoncer « Lecture du ticket » avant d'avoir lu quoi que ce soit, c'est
    // affirmer au lieu d'attendre, et ca se lit comme une page figee.
    step: "",
    currentRepo: null,
    startedAt: null,
    escalation: null,
  },
  scope: [],
  functional: [],
  technical: [],
  tests: [],
  code: [],
  contradictions: [],
  metrics: {
    humanInterventions: null,
    loopTurnsTotal: null,
    mrFeedbackCount: null,
  },
  planApprovedAt: null,
  planRepos: [],
};

export function readTicket(raw: unknown): Ticket {
  const root = asRecord(raw);
  if (!root) return EMPTY_TICKET;

  const ticket = asRecord(root.ticket) ?? {};
  const run = asRecord(root.run) ?? {};
  const arbitrages = asRecord(root.arbitrages) ?? {};
  const plan = asRecord(root.plan) ?? {};
  const checklists = asRecord(plan.checklists) ?? {};
  const memory = asRecord(root.memory) ?? {};
  const metrics = asRecord(root.metrics) ?? {};
  const figma = asRecord(root.figma) ?? {};

  return {
    key: text(ticket.key),
    title: text(ticket.title),
    url: text(ticket.url),
    jiraStatus: text(ticket.statusAtStart),
    type: text(ticket.type),
    description: text(ticket.description),
    acceptanceCriteria: text(ticket.acceptanceCriteria),
    // Les `--figma` de la ligne de commande s'ajoutent a ceux du ticket, et
    // c'est le cas courant : la maquette existe rarement sur le ticket.
    figmaUrls: [...new Set([...list(figma.urls), ...list(root.figmaOverrides)].map(text).filter(isPresent))],
    figmaFrames: list(figma.frames).map(readFrame).filter(isPresent),
    scouted: list(memory.scouted).map(readScout).filter(isPresent),
    memoryOperations: list(memory.operations).map(readOperation).filter(isPresent),
    memoryCommit: text(memory.commit),
    run: {
      phase: text(run.phase),
      // Les agents ecrivent tantot "10.4", tantot 8.
      step: text(run.step) ?? "1",
      currentRepo: text(run.currentRepo),
      startedAt: text(run.startedAt),
      escalation: readEscalation(run.escalation),
    },
    scope: list(root.scope)
      .map(readRepo)
      .filter((repo): repo is RepoEntry => repo !== null),
    functional: list(arbitrages.functional).map(readArbitrage).filter(isPresent),
    technical: list(arbitrages.technical).map(readArbitrage).filter(isPresent),
    tests: list(checklists.tests).map(readChecklistLine).filter(isPresent),
    code: list(checklists.code).map(readChecklistLine).filter(isPresent),
    contradictions: list(memory.contradictions).map(readContradiction).filter(isPresent),
    metrics: {
      humanInterventions: number(metrics.humanInterventions),
      loopTurnsTotal: number(metrics.loopTurnsTotal),
      mrFeedbackCount: number(metrics.mrFeedbackCount),
    },
    planApprovedAt: text(plan.approvedAt),
    planRepos: list(plan.repos).map(readPlanRepo).filter(isPresent),
  };
}

function readRepo(raw: unknown): RepoEntry | null {
  const entry = asRecord(raw);
  if (!entry) return null;
  // `repo` dans les faits, `name` dans le squelette.
  const name = text(entry.repo) ?? text(entry.name);
  if (!name) return null;

  const loops = new Map<string, number>();
  for (const [key, value] of Object.entries(asRecord(entry.loops) ?? {})) {
    const count = number(value);
    if (count !== null) loops.set(key, count);
  }

  return {
    name,
    level: number(entry.level),
    status: text(entry.status) ?? "pending",
    area: text(entry.area),
    reason: text(entry.reason),
    evidence: list(entry.evidence).map(text).filter(isPresent),
    loops,
    commits: list(entry.commits).map(text).filter(isPresent),
  };
}

function readArbitrage(raw: unknown): Arbitrage | null {
  const entry = asRecord(raw);
  const question = entry && text(entry.question);
  const answer = entry && text(entry.answer);
  if (!entry || !question || !answer) return null;
  return { at: text(entry.at), question, answer, why: text(entry.why) };
}

function readChecklistLine(raw: unknown): ChecklistLine | null {
  const entry = asRecord(raw);
  const criterion = entry && text(entry.criterion);
  if (!entry || !criterion) return null;
  return {
    id: text(entry.id) ?? criterion.slice(0, 12),
    criterion,
    status: text(entry.status) ?? "pending",
  };
}

function readContradiction(raw: unknown): Contradiction | null {
  const entry = asRecord(raw);
  const note = entry && text(entry.note);
  if (!entry || !note) return null;
  return {
    note,
    claim: text(entry.claim),
    // `evidence` chez le tool, `detail` chez l'agent : les deux disent la preuve.
    detail: text(entry.detail) ?? text(entry.evidence),
    verdict: text(entry.verdict),
    raisedBy: text(entry.raisedBy),
    at: text(entry.at),
  };
}

function readFrame(raw: unknown): FigmaFrame | null {
  const entry = asRecord(raw);
  const url = entry && text(entry.url);
  if (!entry || !url) return null;
  return {
    url,
    nodeId: text(entry.nodeId),
    name: text(entry.name),
    image: text(entry.image),
    outline: list(entry.outline).map(text).filter(isPresent),
  };
}

function readScout(raw: unknown): MemoryScout | null {
  const entry = asRecord(raw);
  if (!entry) return null;
  const notes = list(entry.notes)
    .map((note) => {
      const record = asRecord(note);
      // Un agent ecrit tantot l'objet, tantot le chemin seul.
      if (!record) return text(note) ? { path: text(note) as string, says: null } : null;
      const path = text(record.path);
      return path ? { path, says: text(record.says) ?? text(record.summary) } : null;
    })
    .filter(isPresent);

  return {
    pass: text(entry.pass) === "ciblee" ? "ciblee" : "large",
    at: text(entry.at),
    filesRead: number(entry.filesRead),
    notes,
    silentOn: list(entry.silentOn).map(text).filter(isPresent),
  };
}

const MEMORY_OPS: readonly MemoryOp[] = ["create", "update", "delete"];

function readOperation(raw: unknown): MemoryOperation | null {
  const entry = asRecord(raw);
  const path = entry && text(entry.path);
  if (!entry || !path) return null;
  // `rewrite` chez le memory-planner, `update` dans l'etat : les deux disent
  // qu'une note existante a ete reecrite.
  const written = text(entry.op) === "rewrite" ? "update" : text(entry.op);
  const op = MEMORY_OPS.find((candidate) => candidate === written);
  return op ? { op, path, why: text(entry.why) ?? text(entry.reason) } : null;
}

function readEscalation(raw: unknown): Escalation | null {
  const entry = asRecord(raw);
  const reason = entry && text(entry.reason);
  if (!entry || !reason) return null;
  return {
    at: text(entry.at) ?? "",
    step: text(entry.step) ?? "",
    repo: text(entry.repo),
    reason,
  };
}

// ------------------------------------------------------------- primitives ----

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function list(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

/** Accepte une chaine ou un nombre ; rend null sur le vide, jamais "null". */
function text(value: unknown): string | null {
  if (typeof value === "string") return value.trim() === "" ? null : value;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return null;
}

function number(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value)))
    return Number(value);
  return null;
}

function isPresent<T>(value: T | null): value is T {
  return value !== null;
}

/** `10.4` appartient au point 10. Tolere un nombre ecrit par un agent. */
const STEP_TOKEN = /^\s*(?:point\s*)?(\d{1,2})(?:\.(\d+))?/i;

/**
 * Le point, et son sous-point, extraits de ce qu'un agent a bien voulu ecrire.
 *
 * `run.step` est du texte libre dans un YAML, et c'est un agent qui le pose. Il
 * a ecrit `"10.4"`, il a ecrit `8`, et il a fini par ecrire
 * `"4 - functional-grill"` — sur quoi la page a repondu qu'elle attendait
 * toujours son premier event, treize etapes eteintes, alors que le run tournait
 * depuis une minute. Une comparaison exacte sur une chaine que le shell n'ecrit
 * pas est un point de rupture, pas une validation : on lit le nombre de tete et
 * on ignore le reste.
 */
export function stepToken(step: string): { top: string; sub: number } | null {
  const found = STEP_TOKEN.exec(String(step));
  if (!found) return null;
  const sub = Number(found[2] ?? 0);
  return { top: found[1] as string, sub: Number.isFinite(sub) ? sub : 0 };
}

export function topLevelStep(step: string): string {
  return stepToken(step)?.top ?? String(step);
}

/**
 * Les treize étapes du run.
 *
 * Les libellés se lisent seuls : un collègue qui n'a jamais lancé de run doit
 * comprendre sans qu'on commente par-dessus son épaule. « Grill » et « gate »
 * sont du jargon interne, ils ne sortent jamais à l'écran — y compris quand un
 * agent les écrit dans le titre de son event.
 *
 * `docket` dit quelle section du dossier ce point a produite — c'est ce qui
 * fait du rail un sommaire et pas une decoration.
 */
export const STEPS = [
  { id: "1", label: "Lecture du ticket", docket: null },
  { id: "2", label: "Maquettes", docket: null },
  { id: "3", label: "Mémoire, tour large", docket: null },
  { id: "4", label: "Questions fonctionnelles", docket: "functional" },
  { id: "5", label: "Périmètre des dépôts", docket: "scope" },
  { id: "6", label: "Mémoire, tour ciblé", docket: null },
  { id: "7", label: "Questions techniques", docket: "technical" },
  { id: "8", label: "Plan et checklists", docket: "checklists" },
  { id: "9", label: "Approbation", docket: null },
  { id: "10", label: "Implémentation", docket: "checklists" },
  { id: "11", label: "Plan mémoire", docket: "contradictions" },
  { id: "12", label: "Écriture mémoire", docket: "contradictions" },
  { id: "13", label: "Publication", docket: null },
] as const;

export type DocketSection = "functional" | "scope" | "technical" | "checklists" | "contradictions";

/**
 * Le nom de chaque section, ecrit une seule fois.
 *
 * Le rail, le sommaire, la bande mobile et les en-tetes du dossier parlent des
 * memes choses : trois orthographes pour une section, c'est le cout de
 * recoupement que cette page existe pour supprimer.
 */
export const DOCKET_LABELS: Record<DocketSection, string> = {
  functional: "Décisions fonctionnelles",
  technical: "Décisions techniques",
  // Une seule entrée pour les dépôts : la liste du rail porte l'état et le
  // niveau, et emmène au pourquoi. Deux libellés pour deux vues de la même
  // chose, c'est le recoupement que cette page existe pour supprimer.
  scope: "Dépôts concernés",
  checklists: "Checklists de sortie",
  contradictions: "Notes de mémoire contredites",
};

export function stepIndex(step: string): number {
  const top = topLevelStep(step);
  return STEPS.findIndex((entry) => entry.id === top);
}

/**
 * Quel point du workflow chaque agent tient.
 *
 * C'est le filet de securite de l'etape affichee. `run.step` est ecrit par un
 * agent dans un fichier YAML, donc il retarde toujours un peu et il peut ne
 * jamais etre ecrit ; le flux, lui, dit qui parle a la seconde pres. Un agent
 * qui parle est une preuve directe que le run est a son point.
 *
 * `doc-scout` passe deux fois — une fois large au point 3, une fois ciblee au
 * point 6. On ne peut pas les distinguer sur son nom, alors on prend celui qui
 * ne fait pas reculer le curseur : c'est la seule lecture qui ne peut pas
 * mentir dans le mauvais sens.
 */
const AGENT_STEPS: Record<string, readonly string[]> = {
  "doc-scout": ["3", "6"],
  "functional-grill": ["4"],
  "scope-scout": ["5"],
  "technical-grill": ["7"],
  planner: ["8"],
  orchestrator: ["10"],
  "test-writer": ["10"],
  "test-adversary": ["10"],
  "red-checker": ["10"],
  developer: ["10"],
  "green-checker": ["10"],
  "code-adversary": ["10"],
  "memory-planner": ["11"],
  "memory-writer": ["12"],
  finalizer: ["13"],
};

/**
 * Qui a ete invoque par qui.
 *
 * Le cycle d'implementation est le seul endroit du workflow ou un agent en
 * ouvre un autre : l'`orchestrator` route, et les six agents du cycle 10.x
 * travaillent sous lui. Les mettre cote a cote sous « Implementation » disait
 * qu'ils se relayaient entre pairs, alors que l'un tient les compteurs pendant
 * que les autres passent.
 *
 * Partout ailleurs la table est vide, et le rail reste a deux niveaux.
 */
const AGENT_PARENTS: Record<string, string> = {
  "test-writer": "orchestrator",
  "test-adversary": "orchestrator",
  "red-checker": "orchestrator",
  developer: "orchestrator",
  "green-checker": "orchestrator",
  "code-adversary": "orchestrator",
};

/** L'agent qui a invoque celui-ci, s'il y en a un. */
export function parentOfAgent(agent: string): string | null {
  return AGENT_PARENTS[agent] ?? null;
}

/**
 * L'etape qu'implique un agent, sans jamais revenir en arriere.
 *
 * `floor` est l'etape la plus avancee connue par ailleurs : on rend le premier
 * point de l'agent qui est au moins la, et son dernier point sinon.
 */
export function stepOfAgent(agent: string, floor: number): string | null {
  const candidates = AGENT_STEPS[agent];
  if (!candidates || candidates.length === 0) return null;
  for (const candidate of candidates) {
    if (stepIndex(candidate) >= floor) return candidate;
  }
  return candidates.at(-1) ?? null;
}

function readPlanRepo(raw: unknown): PlanRepoEntry | null {
  const entry = asRecord(raw);
  const repo = entry && (text(entry.repo) ?? text(entry.name));
  if (!repo || !entry) return null;
  return {
    repo,
    level: number(entry.level),
    changes: list(entry.changes)
      .map((change) => text(change))
      .filter((change): change is string => change !== null),
    why: text(entry.why) ?? text(entry.reason),
  };
}
