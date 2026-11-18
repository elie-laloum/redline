/**
 * Who answered the functional framing. Only the product owner's answers may rewrite the ticket;
 * the developer's stand as an alternative until the product owner validates them.
 */
export const RESPONDENTS = ["po", "developer"] as const;
export type Respondent = (typeof RESPONDENTS)[number];

export const RESPONDENT_QUESTION_ID = "respondent";

export const RESPONDENT_CHOICES: Readonly<Record<string, Respondent>> = {
  "Le PO": "po",
  "Moi, en attendant la validation du PO": "developer",
};

interface Answered {
  readonly question: { readonly id: string };
  readonly answer: string;
}

/** Null until the question is answered, and when the grill asked nothing at all. */
export function respondentOf(transcript: readonly Answered[]): Respondent | null {
  const answer = transcript.findLast((exchange) => exchange.question.id === RESPONDENT_QUESTION_ID)?.answer;
  return answer === undefined ? null : (RESPONDENT_CHOICES[answer] ?? null);
}

export function divergenceStatus(respondent: Respondent | null): string {
  if (respondent === "po") return "decidees par le PO";
  if (respondent === "developer") return "en attente de validation du PO";
  return "deduites du ticket, sans question posee";
}

/** What becomes of the rewritten passages at closing, as the plan review announces it. */
export function storyFate(respondent: Respondent | null): string {
  if (respondent === "po") return "le PO a repondu : ces seuls passages seront reecrits dans Jira a la cloture, le reste de la fiche est garde tel quel.";
  if (respondent === "developer") return "tu as repondu : une alternative en attente de validation du PO, la fiche Jira n'est pas modifiee.";
  return "aucune question n'a ete posee : la fiche Jira n'est pas modifiee.";
}
