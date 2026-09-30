import assert from "node:assert/strict";
import { mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, describe, it } from "bun:test";
import { authenticationFor, authenticationProblem } from "../../src/adapters/claude-agents.ts";
import { loadSecrets, writeSecret } from "../../src/adapters/secrets.ts";
import { pathsOf } from "../../src/app/paths.ts";
import { loadConfiguration, writeSetting } from "../../src/app/settings.ts";
import { TEMPLATES, temporaryDirectory } from "../helpers.ts";

const directory = temporaryDirectory();
afterAll(() => directory.cleanup());

const secrets = (values: Record<string, string>) => ({ get: (key: string) => values[key] ?? null });

describe("le mode d'authentification des agents", () => {
  it("donne a outpost le fichier du compte, le jeton oauth ou la cle d'API", () => {
    const all = secrets({ CLAUDE_CODE_OAUTH_TOKEN: "jeton", ANTHROPIC_API_KEY: "cle" });
    assert.equal(authenticationFor("account", all), "account");
    assert.deepEqual(authenticationFor("oauth", all), { account: { key: "jeton" } });
    assert.deepEqual(authenticationFor("key", all), { usage: { key: "cle" } });
  });

  it("refuse un mode dont le secret manque, en disant comment le renseigner", () => {
    assert.throws(() => authenticationFor("oauth", secrets({})), /CLAUDE_CODE_OAUTH_TOKEN manquant/);
    assert.equal(authenticationProblem("key", secrets({})), "ANTHROPIC_API_KEY manquant : bun redline auth key");
    assert.equal(authenticationProblem("key", secrets({ ANTHROPIC_API_KEY: "cle" })), null);
  });

  it("cherche le fichier du compte la ou Claude le range", () => {
    const config = join(directory.path, "claude");
    const env = { CLAUDE_CONFIG_DIR: config };
    assert.match(authenticationProblem("account", secrets({}), env) ?? "", /claude\/\.credentials\.json absent/);
    mkdirSync(config, { recursive: true });
    writeFileSync(join(config, ".credentials.json"), "{}");
    assert.equal(authenticationProblem("account", secrets({}), env), null);
  });
});

describe("le .env de redline", () => {
  const file = join(directory.path, "secrets", ".env");

  it("recoit un secret sans perdre les autres lignes, lisible par son seul proprietaire", () => {
    mkdirSync(join(directory.path, "secrets"), { recursive: true });
    writeFileSync(file, "# Jira\nJIRA_EMAIL=moi@test\nANTHROPIC_API_KEY=ancienne\n");
    writeSecret(file, "ANTHROPIC_API_KEY", "nouvelle");
    writeSecret(file, "CLAUDE_CODE_OAUTH_TOKEN", "jeton");
    assert.equal(readFileSync(file, "utf8"), "# Jira\nJIRA_EMAIL=moi@test\nANTHROPIC_API_KEY=nouvelle\nCLAUDE_CODE_OAUTH_TOKEN=jeton\n");
    assert.equal(statSync(file).mode & 0o777, 0o600);
  });

  it("cede a une variable exportee dans le shell", () => {
    assert.equal(loadSecrets(file, {}).get("ANTHROPIC_API_KEY"), "nouvelle");
    assert.equal(loadSecrets(file, { ANTHROPIC_API_KEY: "du-shell" }).get("ANTHROPIC_API_KEY"), "du-shell");
  });
});

describe("l'ecriture d'un reglage", () => {
  const template = readFileSync(join(TEMPLATES, "redline.example.yaml"), "utf8");

  it("part du modele et ne change que la valeur, commentaires et alignement compris", () => {
    const paths = pathsOf(join(directory.path, "home-modele"));
    writeSetting(paths, ["agents", "authentication"], "oauth");
    const written = readFileSync(paths.settings, "utf8");
    assert.equal(written, template.replace(/authentication: account/, "authentication: oauth"));
    assert.equal(loadConfiguration(paths).settings.agents.authentication, "oauth");
  });

  it("ajoute la cle a sa section quand un fichier plus ancien ne la porte pas", () => {
    const paths = pathsOf(join(directory.path, "home-ancien"));
    mkdirSync(paths.home, { recursive: true });
    writeFileSync(paths.settings, template.replace(/ {2}authentication: .*\n/, ""));
    writeSetting(paths, ["agents", "authentication"], "key");
    assert.match(readFileSync(paths.settings, "utf8"), /\nagents:\n {2}authentication: key\n {2}default:\n/);
    assert.equal(loadConfiguration(paths).settings.agents.authentication, "key");
  });

  it("refuse une valeur que les reglages n'acceptent pas", () => {
    const paths = pathsOf(join(directory.path, "home-invalide"));
    assert.throws(() => writeSetting(paths, ["agents", "authentication"], "passe-partout"), /invalide/);
  });
});
