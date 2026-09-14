import { createServerFn } from "@tanstack/react-start";
import type { RunSnapshot } from "./use-live-run.ts";

/**
 * L'instantane du run, rendu cote serveur.
 *
 * Le shell s'ouvre sur un run deja commence, parfois depuis des heures. Attendre
 * l'hydratation pour afficher quoi que ce soit donnerait une page vide au moment
 * exact ou on en a besoin — d'ou le chargement dans le loader plutot que dans un
 * effet.
 *
 * L'import dynamique garde `node:fs` hors du bundle client.
 */
export const getSnapshot = createServerFn({ method: "GET" }).handler(async (): Promise<RunSnapshot> => {
  const { snapshot } = await import("./live-store.ts");
  return snapshot() as RunSnapshot;
});
