const FORBIDDEN = [/@redline\b/i, /@autopilot\b/i];

export function publishableProblems(text: string): string[] {
  const problems: string[] = [];
  if (!text.trim()) problems.push("texte vide");
  for (const marker of FORBIDDEN) if (marker.test(text)) problems.push(`mention interdite : ${marker.source.replace(/\\b/g, "")}`);
  return problems;
}
