import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { Document, isScalar, parse, visit } from "yaml";

const TRAILING_SPACE_BEFORE_NEWLINE = /[ \t]\n/;
const LEADING_INDENT = /^[ \t]/;
const CONTROL_CHARS = new RegExp("[\\u0000-\\u0008\\u000b-\\u001f\\u007f]");

export function stringifyStrict(value: unknown): string {
  const doc = new Document(value);
  visit(doc, {
    Scalar(_key, node) {
      if (isScalar(node) && typeof node.value === "string" && isBlockSafe(node.value)) node.type = "BLOCK_LITERAL";
    },
  });
  return doc.toString({ defaultStringType: "QUOTE_DOUBLE", defaultKeyType: "PLAIN", lineWidth: 0, nullStr: "null" });
}

export function parseYaml(text: string): unknown {
  return parse(text);
}

export function readYamlFile(path: string): unknown {
  return parse(readFileSync(path, "utf8"));
}

export function writeYamlAtomic(path: string, value: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  const temporary = `${path}.${process.pid}.tmp`;
  writeFileSync(temporary, stringifyStrict(value), "utf8");
  renameSync(temporary, path);
}

function isBlockSafe(text: string): boolean {
  return text.includes("\n") && !TRAILING_SPACE_BEFORE_NEWLINE.test(text) && !LEADING_INDENT.test(text) && !CONTROL_CHARS.test(text);
}
