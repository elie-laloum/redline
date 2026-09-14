import { Document, isScalar, parse as yamlParse, visit } from "yaml";

/**
 * Serialiseur strict pour les fichiers ecrits par des agents.
 *
 * Sans quoting systematique, un slug `no` devient `false`, une version `1.10`
 * devient un flottant, une cle nue devient autre chose — et la corruption est
 * silencieuse : on ne la decouvre qu'a la reprise suivante, quand le run repart
 * de travers sans dire pourquoi.
 *
 * Une exception assumee : une chaine multiligne part en bloc litteral `|`. Un
 * bloc litteral ne se coerce jamais en autre chose, donc on garde la garantie
 * de type, et on garde `plan.content` relisible a la main.
 */
export function stringifyStrict(value: unknown): string {
  const doc = new Document(value);
  visit(doc, {
    Scalar(_key, node) {
      if (isScalar(node) && typeof node.value === "string" && isBlockSafe(node.value)) {
        node.type = "BLOCK_LITERAL";
      }
    },
  });
  return doc.toString({
    defaultStringType: "QUOTE_DOUBLE",
    defaultKeyType: "PLAIN",
    lineWidth: 0,
    nullStr: "null",
  });
}

export function parseYaml<T = unknown>(text: string): T {
  return yamlParse(text) as T;
}

const TRAILING_SPACE_BEFORE_NEWLINE = /[ \t]\n/;
const LEADING_INDENT = /^[ \t]/;
const CONTROL_CHARS = new RegExp("[\\u0000-\\u0008\\u000b-\\u001f\\u007f]");

/**
 * Un bloc litteral ne sait representer ni une espace en fin de ligne ni une
 * indentation de premiere ligne : dans ces cas on retombe sur le quoting.
 */
function isBlockSafe(text: string): boolean {
  if (!text.includes("\n")) return false;
  if (TRAILING_SPACE_BEFORE_NEWLINE.test(text)) return false;
  if (LEADING_INDENT.test(text)) return false;
  if (CONTROL_CHARS.test(text)) return false;
  return true;
}
