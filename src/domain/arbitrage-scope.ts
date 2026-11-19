/** The answer that lets a grill decide in the human's place, and record what it assumed. */
export const DECIDE_FOR_ME = "Je ne sais pas : tranche et consigne l'hypothese";

const PROOF_TECHNIQUE = /\b(trace sql|sql genere|requete sql|doit appeler|appelle la|la methode|la fonction privee|prototype|mock|spy|stub|regex|trigger|xmax|plpgsql)\b/i;

/**
 * The words of a note or an arbitrage that demand a proof technique rather than rule on a scope.
 * Such an order collides with the adversaries' mandate against tests coupled to the implementation:
 * the writer obeys it, the adversary must refuse the result, and the loop cannot converge.
 */
export function proofTechniqueWords(text: string): string[] {
  const normalized = text.normalize("NFD").replace(/\p{Diacritic}/gu, "");
  const found = new RegExp(PROOF_TECHNIQUE.source, "gi");
  return [...new Set([...normalized.matchAll(found)].map((match) => match[0].toLowerCase()))];
}
