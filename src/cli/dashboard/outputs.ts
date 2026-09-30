import { stringify } from "yaml";
import { repoOf } from "./model.ts";

export type OutputTone = "title" | "text" | "muted" | "success" | "warning" | "danger" | "info";

export interface OutputLine {
  readonly text: string;
  readonly tone: OutputTone;
  readonly indent: number;
}

type Json = Readonly<Record<string, unknown>>;

const DECISIONS: Readonly<Record<string, string>> = {
  approve: "Plan approuve",
  amend: "Plan a amender",
  "reject-functional": "Rejete : revoir le fonctionnel",
  "reject-technical": "Rejete : revoir le technique",
};

/** What a finished task produced, laid out for its kind of task; unknown kinds fall back to YAML. */
export function describeOutput(key: string, value: unknown): OutputLine[] {
  if (value === null || value === undefined) return [];
  const step = repoOf(key) === null ? key : key.slice(key.lastIndexOf(".") + 1).replace(/^code-\d+$/, "code-lot");
  const lines = Array.isArray(value) ? (LISTS[step]?.(value) ?? yaml(value)) : (DESCRIBE[step]?.(object(value)) ?? yaml(value));
  return lines.length ? lines : [line("(rien a montrer)", "muted")];
}

const DESCRIBE: Readonly<Record<string, (value: Json) => OutputLine[]>> = {
  ticket: (ticket) => [
    line(`${text(ticket.key)} · ${text(ticket.issueType)} · ${text(ticket.status)}`, "muted"),
    line(text(ticket.title), "title"),
    ...(ticket.url ? [line(text(ticket.url), "info")] : []),
    ...section(
      "Criteres",
      list(ticket.criteria).map((criterion) => line(`${text(object(criterion).id)} ${text(object(criterion).text)}`)),
    ),
    ...section(
      "Tickets lies",
      list(ticket.related).map((related) => {
        const entry = object(related);
        return line(`${text(entry.key)} (${text(entry.relation)}) — ${text(entry.title ?? entry.unavailable)}`, entry.unavailable ? "warning" : "text");
      }),
    ),
  ],
  figma: (brief) => [
    ...(list(brief.frames).length ? list(brief.frames).map((frame) => line(`${text(object(frame).name)} — ${text(object(frame).url)}`)) : [line("Aucune maquette.", "muted")]),
    ...section("Ignorees", list(brief.skipped).map((skipped) => line(text(skipped), "warning"))),
  ],
  "memory-broad": memory,
  "memory-targeted": memory,
  functional: grill,
  technical: grill,
  scope: (outcome) => {
    const scope = object(outcome.scope);
    return [
      ...section(
        "Impactes",
        list(scope.impacted).flatMap((impacted) => {
          const entry = object(impacted);
          return [line(`${text(entry.repo)} (niveau ${text(entry.level)}) — ${text(entry.area)}`), ...list(entry.evidence).map((evidence) => line(text(evidence), "muted", 2))];
        }),
      ),
      ...section("Ecartes", list(scope.excluded).map((excluded) => line(`${text(object(excluded).repo)} : ${text(object(excluded).reason)}`, "muted"))),
      ...contradictions(outcome.contradictions),
    ];
  },
  plan: (converged) => {
    const plan = object(converged.candidate);
    return [
      line(text(plan.summary)),
      ...list(plan.repos).flatMap((repo, index) => {
        const entry = object(repo);
        return [
          line(""),
          line(`${index + 1}. ${text(entry.repo)} (${text(entry.type)}) — ${text(entry.why)}`, "title"),
          ...list(entry.changes).map((change) => line(`- ${text(change)}`, "text", 2)),
          ...list(entry.tests).map((test) => line(`${text(object(test).id)} [${text(object(test).kind)}] ${text(object(test).criterion)}`, "muted", 2)),
          ...list(entry.code).map((code) => line(`${text(object(code).id)} ${text(object(code).criterion)}`, "muted", 2)),
        ];
      }),
      ...section("Points ouverts", list(plan.openPoints).map((point) => line(text(point), "warning"))),
      ...rounds(converged),
    ];
  },
  review: (interviewed) => {
    const review = object(interviewed.output);
    const decision = text(review.decision);
    return [line(DECISIONS[decision] ?? decision, decision === "approve" ? "success" : "warning"), ...(review.note ? [line(text(review.note), "text", 2)] : [])];
  },
  workspace: (prepared) => [
    line(`branche ${text(prepared.branch)}`),
    line(`base ${short(prepared.base)}`, "muted"),
    line(text(prepared.directory), "muted"),
    ...section("Dependances montees", list(prepared.bumps).map((bump) => line(text(bump)))),
  ],
  tests: (converged) => {
    const candidate = object(converged.candidate);
    const files = list(candidate.files);
    return [
      ...(files.length ? files.map((file) => line(`${text(object(file).path)}  ${list(object(file).tests).map(text).join(", ")}`)) : [line("Aucun test prevu pour ce depot.", "muted")]),
      ...section("Annules hors zone", list(candidate.reverted).map((path) => line(text(path), "warning"))),
      ...(candidate.head ? [line(`tete ${short(candidate.head)}`, "muted")] : []),
      ...rounds(converged),
    ];
  },
  "code-lot": code,
  code: (converged) => [...code(object(converged.candidate)), ...rounds(converged)],
  release: (release) => [line(`tag ${text(release.tag)}`, "success")],
  summary: (delivered) => [
    line(`branche ${text(delivered.branch)} → ${text(delivered.baseBranch)}`),
    ...section("Commits", list(delivered.commits).map((commit) => line(text(commit)))),
    ...(delivered.release ? [line(`tag ${text(object(delivered.release).tag)}`, "success")] : []),
    ...contradictions(delivered.contradictions),
  ],
  "memory-plan": (converged) => [...operations(object(converged.candidate).operations), ...rounds(converged)],
  "memory-apply": (applied) => [...(applied.commit ? [line(`commit ${short(applied.commit)}`, "success")] : [line("Aucun commit : la memoire n'a pas change.", "muted")]), ...operations(applied.operations)],
  prose: (converged) => {
    const prose = object(converged.candidate);
    return [
      ...section("Slack", paragraph(prose.slack)),
      ...section("Jira", paragraph(prose.jira)),
      ...list(prose.mergeRequests).flatMap((request) => section(`MR ${text(object(request).repo)}`, paragraph(object(request).summary))),
      ...rounds(converged),
    ];
  },
  slack: (publication) => [
    line(`#${text(object(publication.channel).name)}`, "title"),
    ...section("Invites", list(publication.invited).map((email) => line(text(email)))),
    ...section("Introuvables", list(publication.unknown).map((email) => line(text(email), "warning"))),
  ],
  jira: (publication) => [
    line(publication.transition ? `ticket passe en ${text(publication.transition)}` : "statut inchange", publication.transition ? "success" : "muted"),
    line(publication.commented ? "commentaire poste" : "commentaire deja present", "muted"),
  ],
};

// These two tasks hand a list on.
const LISTS: Readonly<Record<string, (value: readonly unknown[]) => OutputLine[]>> = {
  "push-branches": (branches) => branches.map((branch) => line(`${text(branch)} pousse`, "success")),
  "merge-requests": (requests) => requests.map((request) => line(`${text(object(request).repo)} — ${text(object(request).url)}`, "info")),
};

function memory(brief: Json): OutputLine[] {
  const paths = list(brief.paths);
  return paths.length ? [line(`${paths.length} note(s) retenue(s)`, "muted"), ...paths.map((path) => line(text(path)))] : [line("Aucune note retenue.", "muted")];
}

function grill(interviewed: Json): OutputLine[] {
  const outcome = object(interviewed.output);
  const arbitrages = list(outcome.arbitrages);
  return [
    ...(arbitrages.length
      ? arbitrages.flatMap((arbitrage) => {
          const entry = object(arbitrage);
          return [line(`• ${text(entry.question)}`, "title"), line(`→ ${text(entry.answer)}`, "success", 2), line(text(entry.why), "muted", 2)];
        })
      : [line("Aucun arbitrage.", "muted")]),
    ...(list(interviewed.transcript).length ? [line(`${list(interviewed.transcript).length} echange(s) avec toi`, "muted")] : []),
    ...contradictions(outcome.contradictions),
  ];
}

function code(candidate: Json): OutputLine[] {
  return [
    ...(candidate.head ? [line(`tete ${short(candidate.head)}`, "muted")] : []),
    ...section(
      "Recours",
      list(candidate.appeals).map((appeal) => line(`${text(object(appeal).kind)}${object(appeal).test ? ` ${text(object(appeal).test)}` : ""} : ${text(object(appeal).reason)}`, "warning")),
    ),
    ...section("Annules hors zone", list(candidate.reverted).map((path) => line(text(path), "warning"))),
    ...contradictions(candidate.contradictions),
  ];
}

function operations(value: unknown): OutputLine[] {
  const entries = list(value);
  if (entries.length === 0) return [line("Aucune operation.", "muted")];
  return entries.flatMap((operation) => {
    const entry = object(operation);
    return [line(`${text(entry.action)} ${text(entry.path)}`), line(text(entry.why), "muted", 2)];
  });
}

function contradictions(value: unknown): OutputLine[] {
  return section(
    "Contradictions avec la memoire",
    list(value).map((contradiction) => line(`${text(object(contradiction).note)} : ${text(object(contradiction).claim)}`, "warning")),
  );
}

function rounds(converged: Json): OutputLine[] {
  const round = object(converged.carry).round;
  return typeof round === "number" && round > 1 ? [line(`converge au tour ${round}`, "muted")] : [];
}

function section(title: string, lines: readonly OutputLine[]): OutputLine[] {
  return lines.length ? [line(""), line(title, "title"), ...lines.map((entry) => ({ ...entry, indent: entry.indent + 2 }))] : [];
}

function paragraph(value: unknown): OutputLine[] {
  return text(value)
    .trim()
    .split("\n")
    .map((part) => line(part));
}

function yaml(value: unknown): OutputLine[] {
  return stringify(value, { lineWidth: 0 })
    .trimEnd()
    .split("\n")
    .map((part) => line(part, "muted"));
}

function line(content: string, tone: OutputTone = "text", indent = 0): OutputLine {
  return { text: content, tone, indent };
}

function object(value: unknown): Json {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Json) : {};
}

function list(value: unknown): readonly unknown[] {
  return Array.isArray(value) ? value : [];
}

function text(value: unknown): string {
  return value === null || value === undefined ? "" : String(value);
}

function short(value: unknown): string {
  return text(value).slice(0, 8);
}
