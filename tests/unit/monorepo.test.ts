import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, describe, it } from "bun:test";
import { manifestVersion, packagesOf } from "../../src/adapters/packages.ts";
import { filterFlags, installCommand } from "../../src/domain/monorepo.ts";
import { temporaryDirectory } from "../helpers.ts";

const root = temporaryDirectory();
afterAll(() => root.cleanup());

const write = (path: string, content: string) => {
  mkdirSync(join(root.path, path, ".."), { recursive: true });
  writeFileSync(join(root.path, path), content);
};

write("package.json", JSON.stringify({ name: "mono", version: "2.4.0" }));
write("apps/web/package.json", JSON.stringify({ name: "@mono/web" }));
write("packages/helpers/package.json", JSON.stringify({ name: "@mono/helpers" }));

describe("les paquets touches d'un monorepo", () => {
  it("remontent au package.json le plus proche, jamais a la racine", () => {
    assert.deepEqual(packagesOf(root.path, ["apps/web/src/a.ts", "apps/web/src/b.ts", "packages/helpers/src/x.ts", "README.md"]), ["@mono/helpers", "@mono/web"]);
  });

  it("deviennent des filtres de l'outil du monorepo", () => {
    assert.equal(filterFlags("turbo", ["@mono/web"]), "--filter=@mono/web");
    assert.equal(filterFlags("lerna", ["@mono/web"]), "--scope=@mono/web");
    assert.equal(filterFlags(null, ["@mono/web"]), "");
  });

  it("lisent la version de base d'un repo publiable", () => {
    assert.equal(manifestVersion(root.path, "package.json"), "2.4.0");
    assert.equal(manifestVersion(root.path, "absent.json"), null);
  });

  it("s'installent avec la commande figee du gestionnaire", () => {
    assert.equal(installCommand("pnpm"), "pnpm install --frozen-lockfile");
    assert.equal(installCommand("npm"), "npm ci");
  });
});
