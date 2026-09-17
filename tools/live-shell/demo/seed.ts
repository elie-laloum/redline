#!/usr/bin/env node
import { copyFileSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { stringify } from "yaml";
import { makeClock, MOMENTS, type MomentName, project } from "./run.ts";

/**
 * Le run de demonstration, ecrit sur disque.
 *
 * Le shell ne detient rien : il lit l'etat du ticket, le journal d'events et
 * les maquettes dans `AUTOPILOT_HOME`. Une demo n'a donc pas besoin d'un mode
 * special dans l'application — elle a besoin d'un home qui raconte un run
 * complet. C'est tout ce que fait ce script, et c'est ce qui garantit que la
 * page montree en demo est exactement celle d'un vrai run.
 *
 * **Les horodatages sont poses au moment de l'ecriture.** Le bandeau affiche la
 * duree de l'etape courante et le rail son age : un journal fige a une date
 * annoncerait « publication depuis 3 jours » devant la salle. On re-seme donc
 * avant de montrer, et le run a toujours son age au compteur.
 *
 *   AUTOPILOT_HOME=... AUTOPILOT_TICKET_ID=FT-1042-demo node demo/seed.ts
 *
 * Sans rien de plus, le run s'arrete a la publication, en cours : c'est le seul
 * moment ou les treize points ont tous produit leur matiere, donc le seul ou la
 * page porte tous ses widgets a la fois — l'enonce, la maquette, les deux tours
 * de memoire, les arbitrages, le perimetre, le plan approuve, la revue tout au
 * vert, les deux chantiers, la memoire ecrite.
 *
 * `AUTOPILOT_DEMO_AT` sert le cas inverse : arreter le run **avant** la fin,
 * pour montrer la page a un point ou elle ne porte pas encore tout. C'est ce
 * dont un film a besoin, et c'est la seule chose que la capture demande au
 * seed — le reste du direct passe par les canaux du shell, comme un vrai run.
 *
 *   AUTOPILOT_DEMO_AT=cadrage node demo/seed.ts
 */

const HOME = process.env.AUTOPILOT_HOME ?? join(homedir(), ".autopilot");
const TICKET = process.env.AUTOPILOT_TICKET_ID ?? "FT-1042-demo";
const RUN = `${TICKET}-01`;
const HERE = dirname(fileURLToPath(import.meta.url));

const requested = process.env.AUTOPILOT_DEMO_AT?.trim();
if (requested && !(requested in MOMENTS)) {
  console.error(`autopilot — moment inconnu : ${requested}`);
  console.error(`  moments : ${Object.keys(MOMENTS).join(", ")}`);
  process.exit(1);
}
const moment = (requested ?? "publication") as MomentName;
const cutAgo = MOMENTS[moment];

const clock = makeClock(cutAgo);
const { events, state } = project({ ticketId: TICKET, runId: RUN, cutAgo, clock });

// ------------------------------------------------------------------ ecriture ----

const ticketsDir = join(HOME, "tickets");
const eventsDir = join(HOME, "events");
const figmaDir = join(HOME, "figma", TICKET);

for (const dir of [ticketsDir, eventsDir, figmaDir]) mkdirSync(dir, { recursive: true });

writeFileSync(join(ticketsDir, `${TICKET}.yaml`), stringify(state, { lineWidth: 0 }), "utf8");
writeFileSync(
  join(eventsDir, `${TICKET}.jsonl`),
  `${events.map((event) => JSON.stringify(event)).join("\n")}\n`,
  "utf8",
);
copyFileSync(join(HERE, "maquette-7155-19416.png"), join(figmaDir, "7155-19416.png"));

/**
 * La session live est effacee, et ce n'est pas du menage.
 *
 * C'est le fichier par lequel un agent retrouve le shell d'un ticket : le
 * laisser en place laisse une session Claude oubliee deposer sa question dans
 * la demo, en plein milieu. Rien ne pilote ce run-la — il n'a donc pas de
 * session a annoncer.
 */
rmSync(join(HOME, "live", `${TICKET}.json`), { force: true });

const run = state.run as { step: string; phase: string };
const started = Date.parse((state.run as { startedAt: string }).startedAt);
const age = Math.round((Date.now() - started) / 60_000);

console.log(`autopilot — run de démonstration ${TICKET}`);
console.log("");
console.log(`  home      ${HOME}`);
console.log(`  état      ${join(ticketsDir, `${TICKET}.yaml`)}`);
console.log(`  moment    ${moment} — point ${run.step}, phase ${run.phase}`);
console.log(`  journal   ${events.length} events, sur ${Math.floor(age / 60)} h ${String(age % 60).padStart(2, "0")}`);
console.log(`  maquette  ${join(figmaDir, "7155-19416.png")}`);
console.log("");
if (moment === "publication") {
  console.log("  Le run s'arrête en publication, en cours : les treize points ont tous produit leur matière.");
} else {
  console.log(`  Le run s'arrête au point ${run.step}. Les points suivants n'ont encore rien produit.`);
}
