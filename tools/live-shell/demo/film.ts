#!/usr/bin/env node
import { createInterface } from "node:readline";
import { homedir } from "node:os";
import { join } from "node:path";
import { writeFileSync } from "node:fs";
import { stringify } from "yaml";
import { beats, makeClock, MOMENTS, type MomentName, project } from "./run.ts";

/**
 * Le machiniste du film.
 *
 * La capture a besoin de deux choses que le shell ne sait pas faire tout seul :
 * pousser les beats suivants sur le fil, et **avancer l'etat du ticket** au fur
 * et a mesure. La premiere passe par `/rpc/event`, un canal public — la camera
 * la fait elle-meme. La seconde demande de reprojeter le run a un instant, donc
 * la matiere du run : c'est ici, et pas dans le projet video, parce qu'un film
 * qui embarquerait sa propre copie de la bande la laisserait deriver.
 *
 * Il tient sur l'entree standard, une commande par ligne, et repond de meme.
 * Un process par beat coutait un demarrage de Node a chaque ligne du journal —
 * soixante demarrages dans une scene, et le direct n'a plus rien de direct.
 *
 * Il n'ecrit **que** le YAML de l'etat. C'est exactement ce que fait
 * `write-store-ticket` dans un vrai run, et le shell le surveille deja : la
 * page se met a jour parce que le fichier a change, pas parce qu'on lui a
 * demande quelque chose de special pour la demo.
 *
 *   {"op":"cut","ago":118}    avance l'etat juste apres ce beat
 *   {"op":"play","ago":118}   le meme, en datant le beat de maintenant
 *
 * La reponse est une ligne JSON. La premiere ligne emise est le plan de la
 * bande : tous les beats, prets a partir sur `/rpc/event`, dans l'ordre.
 */

const HOME = process.env.AUTOPILOT_HOME ?? join(homedir(), ".autopilot");
const TICKET = process.env.AUTOPILOT_TICKET_ID ?? "FT-1042-demo";
const RUN = `${TICKET}-01`;

const requested = process.env.AUTOPILOT_DEMO_AT?.trim();
const moment = ((requested && requested in MOMENTS ? requested : "publication") as MomentName);
/**
 * L'horloge doit etre celle du seed, sinon le journal deja sur disque et l'etat
 * qu'on reecrit par-dessus ne racontent plus le meme run.
 */
const clock = makeClock(MOMENTS[moment]);

const ticketFile = join(HOME, "tickets", `${TICKET}.yaml`);

function writeState(cutAgo: number): void {
  const { state } = project({ ticketId: TICKET, runId: RUN, cutAgo, clock });
  writeFileSync(ticketFile, stringify(state, { lineWidth: 0 }), "utf8");
}

/** Le beat qui suit immediatement celui-ci, en descendant la bande. */
function cutAfter(ago: number): number {
  const next = beats.filter((beat) => beat.ago < ago).map((beat) => beat.ago);
  return next.length > 0 ? Math.max(...next) + 1e-9 : 0;
}

const say = (payload: unknown) => process.stdout.write(`${JSON.stringify(payload)}\n`);

say({
  ready: true,
  moment,
  ticketId: TICKET,
  runId: RUN,
  beats: beats.map((beat, seq) => ({
    seq,
    ago: beat.ago,
    kind: beat.kind,
    status: beat.status,
    repo: beat.repo ?? null,
    agent: beat.agent ?? null,
    tool: beat.tool ?? null,
    step: beat.step,
    title: beat.title,
    detail: beat.detail ?? null,
    payload: beat.payload ?? {},
  })),
});

const lines = createInterface({ input: process.stdin });

for await (const raw of lines) {
  const line = raw.trim();
  if (!line) continue;

  let order: { op?: string; ago?: number };
  try {
    order = JSON.parse(line) as { op?: string; ago?: number };
  } catch {
    say({ ok: false, error: "ligne illisible" });
    continue;
  }

  const ago = order.ago;
  if ((order.op === "cut" || order.op === "play") && typeof ago === "number") {
    // Un beat joue est date de maintenant : la bande couvre trois heures, la
    // capture deux minutes, et c'est le direct qui doit ceder. Le bandeau
    // compare l'horodatage a l'heure du navigateur — dater en avance y
    // afficherait une duree negative.
    if (order.op === "play") clock.play(ago);
    writeState(cutAfter(ago));
    say({ ok: true, ago });
    continue;
  }

  say({ ok: false, error: `op inconnue : ${String(order.op)}` });
}
