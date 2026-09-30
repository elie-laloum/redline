import { readFileSync } from "node:fs";
import assert from "node:assert/strict";

const { version, name } = JSON.parse(readFileSync("package.json", "utf8"));
assert.equal(name, "@elie-laloum/redline");
assert.match(version, /^\d+\.\d+\.\d+$/);
assert.equal(
  process.env.GITHUB_REF_NAME,
  `v${version}`,
  "Release tag must match the package version",
);
console.log(`Validated release ${version}`);
