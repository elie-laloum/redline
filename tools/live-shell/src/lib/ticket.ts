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
  readonly run: RunState;
  readonly scope: readonly RepoEntry[];
  readonly functional: readonly Arbitrage[];
  readonly technical: readonly Arbitrage[];
  readonly tests: readonly ChecklistLine[];
  readonly code: readonly ChecklistLine[];
  readonly contradictions: readonly Contradiction[];
  readonly metrics: Metrics;
  readonly planApprovedAt: string | null;
}

export const EMPTY_TICKET: Ticket = {
  key: null,
  title: null,
  url: null,
  jiraStatus: null,
  run: { phase: null, step: "1", currentRepo: null, startedAt: null, escalation: null },
  scope: [],
  functional: [],
  technical: [],
  tests: [],
  code: [],
  contradictions: [],
  metrics: { humanInterventions: null, loopTurnsTotal: null, mrFeedbackCount: null },
  planApprovedAt: null,
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

  return {
    key: text(ticket.key),
    title: text(ticket.title),
    url: text(ticket.url),
    jiraStatus: text(ticket.statusAtStart),
    run: {
      phase: text(run.phase),
      // Les agents ecrivent tantot "10.4", tantot 8.
      step: text(run.step) ?? "1",
      currentRepo: text(run.currentRepo),
      startedAt: text(run.startedAt),
      escalation: readEscalation(run.escalation),
    },
    scope: list(root.scope).map(readRepo).filter((repo): repo is RepoEntry => repo !== null),
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
  return { id: text(entry.id) ?? criterion.slice(0, 12), criterion, status: text(entry.status) ?? "pending" };
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
  if (typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value))) return Number(value);
  return null;
}

function isPresent<T>(value: T | null): value is T {
  return value !== null;
}

/** `10.4` appartient au point 10. Tolere un nombre ecrit par un agent. */
export function topLevelStep(step: string): string {
  return String(step).split(".")[0] ?? String(step);
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
  scope: "Pourquoi ces dépôts",
  checklists: "Checklists de sortie",
  contradictions: "Notes de mémoire contredites",
};

export function stepIndex(step: string): number {
  const top = topLevelStep(step);
  return STEPS.findIndex((entry) => entry.id === top);
}
