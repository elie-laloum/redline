import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fail } from "../lib/errors.ts";
import { projectRoot } from "../lib/paths.ts";
import { enumOf, obj } from "../lib/schema.ts";
import { type AnyTool, defineTool } from "../lib/tool.ts";

const SURFACES = ["slack", "jira-comment", "gitlab-thread", "mr-description"] as const;

export const voiceTools: AnyTool[] = [
  defineTool({
    name: "writer-voice-tone",
    description:
      "Rend les regles d'ecriture a appliquer a tout texte publie sous mon identite : Slack, commentaire Jira, thread de MR. Obligatoire avant d'ecrire en public. Les regles sont observees sur un corpus reel, pas supposees.",
    inputSchema: obj({
      surface: enumOf(
        "Ou le texte sera publie. La description de MR garde un gabarit normalise et ne suit pas ces regles.",
        SURFACES,
      ),
    }),
    handler: ({ surface }: { surface?: (typeof SURFACES)[number] }) => {
      const path = join(projectRoot(), "plugins", "autopilot", "rules", "voice.md");
      let rules: string;
      try {
        rules = readFileSync(path, "utf8");
      } catch {
        return fail(
          "Regles de voix introuvables.",
          `Attendu a ${path}. Sans elles, ne publie rien sous mon identite : demande a l'humain.`,
        );
      }

      if (surface === "mr-description") {
        return {
          surface,
          applies: false,
          note: "Les descriptions de MR et les messages de commit gardent leur gabarit normalise : ils ne passent pas par ces regles.",
        };
      }

      return {
        surface: surface ?? "toutes",
        applies: true,
        rules,
        reminders: [
          "Espace avant ? ! : — y compris en anglais.",
          "Les deux-points annoncent un lien, une liste ou un bloc. Jamais une etiquette au milieu d'une phrase.",
          "Backticks autour de tout identifiant technique.",
          "Tutoiement, paragraphes courts separes d'une ligne vide.",
          "Jamais d'excuse, jamais de titre markdown dans un message court, jamais d'emoji dans le corps.",
          "N'ecris jamais @autopilot, sous aucune forme.",
        ],
      };
    },
  }),
];
