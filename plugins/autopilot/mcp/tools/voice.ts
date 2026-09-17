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
      "Rend les regles d'ecriture a appliquer a tout texte publie sous l'identite de l'utilisateur : Slack, commentaire Jira, thread de MR. Obligatoire avant d'ecrire en public. Un profil calibre est observe sur un corpus reel ; a defaut, le modele est rendu et `calibrated` vaut false.",
    inputSchema: obj({
      surface: enumOf(
        "Ou le texte sera publie. La description de MR garde un gabarit normalise et ne suit pas ces regles.",
        SURFACES,
      ),
    }),
    handler: ({ surface }: { surface?: (typeof SURFACES)[number] }) => {
      const dir = join(projectRoot(), "plugins", "autopilot", "rules");
      const path = join(dir, "voice.md");
      const template = join(dir, "voice.template.md");

      // Un profil de voix se calibre sur un corpus reel, donc il appartient a la
      // personne sous le nom de qui on publie : `voice.md` est gitignore. Le
      // modele prend le relais quand il est absent, mais il ne doit jamais se
      // faire passer pour une voix calibree — un texte plausible ecrit sur des
      // regles generiques est exactement ce qu'un collegue repere.
      let rules: string;
      let calibrated = true;
      try {
        rules = readFileSync(path, "utf8");
      } catch {
        calibrated = false;
        try {
          rules = readFileSync(template, "utf8");
        } catch {
          return fail(
            "Regles de voix introuvables.",
            `Ni ${path} ni son modele ${template}. Ne publie rien sous l'identite de l'utilisateur : demande a l'humain.`,
          );
        }
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
        calibrated,
        note: calibrated
          ? undefined
          : "Voix NON calibree : seul le modele est present, aucun profil personnel n'a ete ecrit. Reste strictement factuel, va au plus court, n'imite aucun style, et signale-le dans ton rapport de fin.",
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
