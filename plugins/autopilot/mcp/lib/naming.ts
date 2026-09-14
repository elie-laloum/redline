import { loadConfig } from "./config.ts";
import { fail } from "./errors.ts";

/**
 * Tout le nommage passe par ici. Les gabarits vivent dans `autopilot.yaml` :
 * changer une convention ne doit jamais demander de toucher au code.
 */

export interface NameParts {
  readonly type: string;
  readonly ticket: string;
  readonly titre: string;
}

const DIACRITICS = /[̀-ͯ]/g;

export function slugify(title: string, maxLength = loadConfig().naming.slugMaxLength): string {
  const slug = title
    .normalize("NFD")
    .replace(DIACRITICS, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (slug.length <= maxLength) return slug;
  // On coupe sur un tiret pour ne pas laisser un mot a moitie.
  const cut = slug.slice(0, maxLength);
  const lastDash = cut.lastIndexOf("-");
  return (lastDash > maxLength / 2 ? cut.slice(0, lastDash) : cut).replace(/-+$/g, "");
}

export function assertKnownType(type: string): string {
  const { types } = loadConfig().naming;
  if (!types.includes(type)) {
    fail(`Type de branche inconnu : ${type}.`, `Types autorises : ${types.join(", ")}`);
  }
  return type;
}

/** Le type reste le meme pour la branche et la MR d'un repo donne. */
export function typeFromJiraIssueType(issueType: string): string {
  const table = loadConfig().naming.typeFromJiraIssueType;
  return table[issueType] ?? table.default ?? "task";
}

export function branchName(parts: NameParts): string {
  const { naming } = loadConfig();
  return fill(naming.branch, {
    type: assertKnownType(parts.type),
    ticket: parts.ticket,
    slug: slugify(parts.titre),
    titre: parts.titre,
  });
}

/**
 * Les MR sont creees en brouillon par defaut : c'est le prefixe `Draft: ` qui
 * pilote le statut cote GitLab, pas un champ d'API.
 */
export function mergeRequestName(parts: NameParts, draft = loadConfig().gitlab.mrDraft): string {
  const { naming } = loadConfig();
  const name = fill(naming.mergeRequest, {
    type: assertKnownType(parts.type),
    ticket: parts.ticket,
    slug: slugify(parts.titre),
    titre: parts.titre.trim(),
  });
  return draft ? `Draft: ${name}` : name;
}

/**
 * Slack refuse les majuscules et coupe au-dela de 80 caracteres. Sans
 * normalisation ici, l'echec arrive tard et le message d'erreur ne dit rien.
 */
export function slackChannelName(parts: Pick<NameParts, "ticket" | "titre">): string {
  const { naming } = loadConfig();
  const raw = fill(naming.slackChannel, {
    type: "",
    ticket: parts.ticket,
    slug: slugify(parts.titre),
    titre: parts.titre,
  });
  return raw
    .toLowerCase()
    .normalize("NFD")
    .replace(DIACRITICS, "")
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80)
    .replace(/-+$/g, "");
}

const DEV_VERSION = /^(?<base>.+?)-(?<ticket>[A-Za-z][A-Za-z0-9_]*-\d+)-(?<n>\d+)$/;

/**
 * Version de dev : ce qui se fait deja sur le repo, suffixe par le ticket et un
 * `n` qui s'incremente a chaque publication.
 *
 * `n` se deduit des tags existants, jamais d'un compteur en memoire : si le
 * `code-adversary` fait remuer l'amont apres coup, il faut republier — et
 * republier la meme version, c'est un rejet du registre ou, pire, un cache qui
 * sert l'ancien artefact sans rien dire.
 */
export function nextDevVersion(base: string, ticket: string, existingTags: readonly string[]): string {
  const suffix = loadConfig().naming.devVersionSuffix;
  let highest = 0;
  for (const tag of existingTags) {
    const match = DEV_VERSION.exec(tag);
    if (!match?.groups) continue;
    if (match.groups.base !== base) continue;
    if (match.groups.ticket?.toUpperCase() !== ticket.toUpperCase()) continue;
    highest = Math.max(highest, Number(match.groups.n));
  }
  const n = highest + 1;
  return `${base}-${ticket}${fill(suffix, { type: "", ticket, slug: "", titre: "", n: String(n) })}`;
}

export function parseDevVersion(tag: string): { base: string; ticket: string; n: number } | null {
  const match = DEV_VERSION.exec(tag);
  if (!match?.groups?.base || !match.groups.ticket || !match.groups.n) return null;
  return { base: match.groups.base, ticket: match.groups.ticket, n: Number(match.groups.n) };
}

function fill(template: string, values: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (whole, key: string) => values[key] ?? whole);
}
