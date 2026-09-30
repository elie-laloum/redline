const FIXED: Readonly<Record<string, string>> = {
  ticket: "Lecture du ticket",
  figma: "Maquettes",
  "memory-broad": "Memoire du ticket",
  functional: "Grill fonctionnel",
  scope: "Perimetre",
  "memory-targeted": "Memoire du perimetre",
  technical: "Grill technique",
  plan: "Plan",
  review: "Revue du plan",
  "memory-plan": "Plan memoire",
  "memory-apply": "Commit memoire",
  prose: "Redaction",
  "push-branches": "Push des branches",
  "merge-requests": "Merge requests",
  slack: "Canal Slack",
  jira: "Ticket Jira",
};

const PER_REPO: readonly [RegExp, (repo: string, extra: string) => string][] = [
  [/^(.+)\.workspace$/, (repo) => `${repo} — preparation`],
  [/^(.+)\.tests$/, (repo) => `${repo} — tests`],
  [/^(.+)\.code-(\d+)$/, (repo, lot) => `${repo} — lot de code ${lot}`],
  [/^(.+)\.code$/, (repo) => `${repo} — convergence du code`],
  [/^(.+)\.release$/, (repo) => `${repo} — publication amont`],
  [/^(.+)\.summary$/, (repo) => `${repo} — bilan`],
];

export function labelOf(key: string): string {
  if (FIXED[key]) return FIXED[key];
  for (const [pattern, render] of PER_REPO) {
    const match = pattern.exec(key);
    if (match?.[1]) return render(match[1], match[2] ?? "");
  }
  return key;
}
