import { loadConfig, loadRegistry, orderByLevel } from "../lib/config.ts";
import { describeEnv } from "../lib/env.ts";
import { bool, obj, str } from "../lib/schema.ts";
import { type AnyTool, defineTool } from "../lib/tool.ts";

export const configTools: AnyTool[] = [
  defineTool({
    name: "get-autopilot-config",
    description:
      "Lit autopilot.yaml : budgets de boucle, timeouts, conventions de nommage, allowlist slack, transitions jira. A appeler avant tout ce qui depend d'un chiffre — aucun budget ni delai n'est en dur dans un agent.",
    inputSchema: obj({
      section: str(
        "Section a rendre : budgets, timeouts, memory, naming, gitlab, jira, slack, liveMode. Omise, la configuration complete est rendue.",
      ),
    }),
    handler: ({ section }: { section?: string }) => {
      const config = loadConfig();
      if (!section) return config;
      const value = (config as unknown as Record<string, unknown>)[section];
      if (value === undefined) {
        return { error: `Section inconnue : ${section}`, sections: Object.keys(config) };
      }
      return { [section]: value };
    },
  }),

  defineTool({
    name: "get-autopilot-env",
    description:
      "Dit quels secrets sont configures, sans jamais rendre leur valeur. A appeler pour verifier qu'un service est utilisable avant de tenter l'appel plutot que d'echouer au milieu d'une publication.",
    inputSchema: obj({}),
    handler: () => {
      const entries = describeEnv();
      const missing = entries.filter((entry) => entry.required && !entry.present).map((entry) => entry.key);
      return {
        secrets: entries,
        missingRequired: missing,
        usable: missing.length === 0,
        note: "Les valeurs ne sortent jamais de ce process. Un secret manquant se corrige dans le .env du projet.",
      };
    },
  }),

  defineTool({
    name: "get-repositories-registry",
    description:
      "Lit repositories.yaml : la seule source de verite sur les repos, leur level, leurs commandes de test et de lint, leurs jobs de CI et leurs dependances. Aucune commande ne doit etre deduite d'un runner detecte.",
    inputSchema: obj({
      name: str("Nom d'un repo precis. Omis, tout le registre est rendu, ordonne par level croissant."),
      includeEvalRepos: bool("Inclure les repos de banc d'essai. Faux par defaut : ils ne concernent que les tickets TJ."),
    }),
    handler: ({ name, includeEvalRepos }: { name?: string; includeEvalRepos?: boolean }) => {
      const registry = loadRegistry();
      if (name) {
        const repo = registry.repositories.find((entry) => entry.name === name);
        return repo ?? { error: `Repo inconnu : ${name}`, known: registry.repositories.map((r) => r.name) };
      }
      const repositories = orderByLevel(
        includeEvalRepos
          ? registry.repositories
          : registry.repositories.filter((repo) => !registry.evalOnly.repos.includes(repo.name)),
      );
      return {
        schemaVersion: registry.schemaVersion,
        repositories,
        evalOnly: registry.evalOnly,
        note: "Ordonne par level croissant : c'est l'ordre de traitement, amont vers aval.",
      };
    },
  }),
];
