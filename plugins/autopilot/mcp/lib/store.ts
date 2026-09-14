import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { squadOf } from "./config.ts";
import { fail } from "./errors.ts";
import { ticketStatePath } from "./paths.ts";
import { parseYaml, stringifyStrict } from "./yaml.ts";

export type Json = null | boolean | number | string | Json[] | { [key: string]: Json };

/**
 * L'etat d'un ticket est la machine a etats du run. Plusieurs agents y ecrivent
 * pendant le meme run, et aucun n'a le contexte complet : un ecrasement en
 * remplacement total serait le bug le plus cher du systeme, parce qu'il est
 * silencieux et qu'on ne le voit qu'a la reprise.
 *
 * D'ou un merge/patch, avec trois regles et une echappatoire :
 *
 * - objet contre objet     -> fusion en profondeur
 * - liste d'objets         -> fusion par identite (`name`, `id`, `repo`, ...),
 *                             les entrees inconnues sont ajoutees a la fin
 * - liste de scalaires     -> union, dans l'ordre, sans doublon
 * - `null` dans le patch   -> efface explicitement le champ
 * - `{ __replace: [...] }` -> remplace la valeur telle quelle, quand c'est
 *                             vraiment ce qu'on veut (une reinitialisation)
 * - `{ __increment: 1 }`   -> ajoute au nombre existant. Un compteur qu'on
 *                             ecrit en valeur absolue est faux des que deux
 *                             agents l'incrementent sans se voir, et c'est
 *                             exactement le cas des compteurs de boucle et
 *                             des interventions humaines
 *
 * Absent du patch ne veut jamais dire « vide » : ca veut dire « je n'en sais
 * rien », et le champ existant survit.
 */

const IDENTITY_KEYS = ["name", "id", "repo", "test", "note", "url", "key"] as const;
const REPLACE_SENTINEL = "__replace";
const INCREMENT_SENTINEL = "__increment";

export function mergePatch(base: Json, patch: Json): Json {
  if (isReplaceEnvelope(patch)) return patch[REPLACE_SENTINEL] as Json;
  if (isIncrementEnvelope(patch)) {
    const step = patch[INCREMENT_SENTINEL];
    return (typeof base === "number" ? base : 0) + step;
  }
  if (patch === null) return null;
  if (Array.isArray(patch)) return mergeArrays(Array.isArray(base) ? base : [], patch);
  if (isPlainObject(patch)) {
    const target: Record<string, Json> = isPlainObject(base) ? { ...base } : {};
    for (const [key, value] of Object.entries(patch)) {
      target[key] = mergePatch(target[key] ?? null, value);
    }
    return target;
  }
  return patch;
}

function mergeArrays(base: Json[], patch: Json[]): Json[] {
  const patchHasObjects = patch.some(isPlainObject);
  if (!patchHasObjects) {
    // Union de scalaires : les commits du developer s'empilent, ils ne se
    // remplacent pas. Un agent qui ne connait qu'un commit n'efface pas les
    // autres.
    const seen = new Set<string>();
    const out: Json[] = [];
    for (const item of [...base, ...patch]) {
      const token = JSON.stringify(item);
      if (seen.has(token)) continue;
      seen.add(token);
      out.push(item);
    }
    return out;
  }

  const identity = identityKeyOf(patch) ?? identityKeyOf(base);
  if (!identity) return patch;

  const out: Json[] = base.map((item) => item);
  for (const item of patch) {
    if (!isPlainObject(item)) {
      out.push(item);
      continue;
    }
    const id = item[identity];
    const index = out.findIndex((candidate) => isPlainObject(candidate) && candidate[identity] === id);
    if (index === -1) out.push(item);
    else out[index] = mergePatch(out[index] ?? null, item);
  }
  return out;
}

function identityKeyOf(items: readonly Json[]): string | null {
  const objects = items.filter(isPlainObject);
  if (objects.length === 0) return null;
  for (const key of IDENTITY_KEYS) {
    if (objects.every((item) => typeof item[key] === "string" || typeof item[key] === "number")) {
      return key;
    }
  }
  return null;
}

function isPlainObject(value: Json): value is { [key: string]: Json } {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isReplaceEnvelope(value: Json): value is { [REPLACE_SENTINEL]: Json } {
  return isPlainObject(value) && REPLACE_SENTINEL in value && Object.keys(value).length === 1;
}

function isIncrementEnvelope(value: Json): value is { [INCREMENT_SENTINEL]: number } {
  return (
    isPlainObject(value) &&
    INCREMENT_SENTINEL in value &&
    Object.keys(value).length === 1 &&
    typeof value[INCREMENT_SENTINEL] === "number"
  );
}

// --------------------------------------------------------------- fichier ----

export function readTicketState(ticketId: string): Json | null {
  try {
    return parseYaml<Json>(readFileSync(ticketStatePath(ticketId), "utf8"));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

export function ticketStateExists(ticketId: string): boolean {
  return readTicketState(ticketId) !== null;
}

/**
 * Ecriture atomique : fichier temporaire puis `rename`. Un run tue en plein
 * milieu d'une ecriture ne doit pas laisser un etat tronque — ce serait la
 * seule facon de rendre un ticket irreprenable.
 */
export function patchTicketState(ticketId: string, patch: Json): Json {
  const path = ticketStatePath(ticketId);
  const base = readTicketState(ticketId) ?? emptyTicketState(ticketId);
  const merged = mergePatch(base, patch);
  if (!isPlainObject(merged)) fail("L'etat d'un ticket doit rester un objet.");

  const run = isPlainObject(merged.run ?? null) ? (merged.run as { [key: string]: Json }) : {};
  merged.run = { ...run, updatedAt: new Date().toISOString() };
  merged.schemaVersion = 1;

  mkdirSync(dirname(path), { recursive: true });
  const temp = `${path}.${process.pid}.tmp`;
  writeFileSync(temp, stringifyStrict(merged), "utf8");
  renameSync(temp, path);
  return merged;
}

/**
 * Le squelette complet des le premier ecrit. Les champs du workflow 2 sont la
 * des la v2 : le jour ou on le branche, aucun ticket deja traite n'a besoin
 * d'etre migre.
 */
export function emptyTicketState(ticketId: string): Json {
  const now = new Date().toISOString();
  return {
    schemaVersion: 1,
    ticket: {
      key: ticketId,
      squad: squadOf(ticketId),
      type: null,
      title: null,
      slug: null,
      url: null,
      statusAtStart: null,
      notes: null,
    },
    figmaOverrides: [],
    run: {
      phase: "cadrage",
      step: "1",
      currentRepo: null,
      liveRunId: null,
      startedAt: now,
      updatedAt: now,
      escalation: null,
    },
    figma: { urls: [] },
    arbitrages: { functional: [], technical: [] },
    plan: { approvedAt: null, content: null, checklists: { tests: [], code: [] } },
    scope: [],
    memory: { contradictions: [], commit: null },
    publication: {
      mergeRequests: [],
      slackChannel: { id: null, name: null, invited: [] },
      jiraTransition: { to: null, at: null },
    },
    metrics: { humanInterventions: 0, loopTurnsTotal: 0, mrFeedbackCount: null },
    workflow2: { feedback: [], lastScannedAt: null, archivedAt: null },
  };
}
