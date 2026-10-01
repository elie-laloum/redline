import { copyFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createCheckRunner } from "../../../adapters/checks.ts";
import { AUTH_LABELS, authenticationProblem, credentialsFile } from "../../../adapters/claude-agents.ts";
import { runtimeStatus } from "../../../adapters/container-runtime.ts";
import { type SecretKey, writeSecret } from "../../../adapters/secrets.ts";
import type { Finding } from "../../../app/diagnostics.ts";
import { connectMemory, pullMemory } from "../../../app/memory-repository.ts";
import { expandTilde, logDirectory, TEMPLATES } from "../../../app/paths.ts";
import { addRepository, detectRepository, proposedLevel, removeRepository, type RepoField, setRepositoryField } from "../../../app/registry-file.ts";
import { resetSetting, writeSetting } from "../../../app/settings.ts";
import type { SetupSnapshot } from "../../../app/setup.ts";
import { AUTH_MODES, COMMAND_KINDS, type CommandKind, type RepoEntry, SettingsSchema, TEST_KINDS } from "../../../domain/config.ts";
import type { Tone } from "../../dashboard/model.ts";
import { buildImage, imageDoctorCommand } from "../../commands/image.ts";
import { formatValue, type Input, parseInput, type Path, seedFor, settingRows } from "../../setup/fields.ts";
import { type Probes, SECTION_LABELS, type SectionId, type ServiceId, serviceOn } from "../../setup/sections.ts";
import { oauthTokenIn, openEditor, runCaptured } from "../handoff.ts";
import type { Page, Row } from "./screen.ts";

/** What a section page reads and does; init keeps the state, the pages only describe it. */
export interface PageContext {
  snapshot(): SetupSnapshot;
  probes(): Probes;
  /** Re-reads the home after a write; the screen redraws from it. */
  reload(): void;
  testService(service: ServiceId): void;
  probeImage(): Promise<void>;
  notify(tone: Tone, text: string): void;
  open(page: () => Page): void;
  handOff<T>(run: () => Promise<T>, pause: boolean): Promise<T>;
  /** Waits for Enter inside a hand-off, so what the child printed stays readable. */
  waitForEnter(): Promise<void>;
  findings(): readonly Finding[] | null;
  runCheck(): Promise<void>;
  /** What the human typed but has not applied yet, kept across redraws. */
  readonly drafts: Drafts;
}

export interface Drafts {
  memory: { url: string; path: string; importNotes: boolean };
  /** The registry as it was before the editor opened, to restore a file left invalid. */
  registryBackup: string | null;
  /** The repository whose removal waits for a second Enter. */
  removing: string | null;
}

/** Keys that other sections set: the settings form leaves them alone. */
const SKIP = [["schemaVersion"], ["services"], ["memory", "repository"], ["memory", "path"], ["agents", "authentication"]];

export function sectionPage(id: SectionId, context: PageContext): Page {
  const title = SECTION_LABELS[id];
  switch (id) {
    case "jira":
      return {
        title,
        rows: service(context, "jira", [
          note("Un jeton d'API Atlassian (id.atlassian.com, Securite, Jetons d'API). Jira Cloud s'authentifie en Basic, avec l'e-mail et le jeton."),
          secretField(context, "JIRA_SITE_URL", "Site", { placeholder: "https://ton-org.atlassian.net" }),
          secretField(context, "JIRA_EMAIL", "E-mail"),
          secretField(context, "JIRA_API_TOKEN", "Jeton d'API", { secret: true }),
        ]),
      };
    case "gitlab":
      return {
        title,
        rows: service(context, "gitlab", [
          note("Un jeton d'acces personnel, avec les portees api et write_repository."),
          secretField(context, "GITLAB_HOST", "Instance", { placeholder: "https://gitlab.com" }),
          secretField(context, "GITLAB_TOKEN", "Jeton", { secret: true }),
        ]),
      };
    case "slack":
      return {
        title,
        rows: service(context, "slack", [
          note("Un jeton UTILISATEUR (xoxp-), pas de bot : le canal et le message paraissent sous ton nom. Portees utilisateur : groups:write, groups:write.invites, bookmarks:write, chat:write, users:read.email."),
          secretField(context, "SLACK_USER_TOKEN", "Jeton utilisateur", { secret: true, placeholder: "xoxp-…" }),
        ]),
      };
    case "figma":
      return { title, rows: service(context, "figma", [note("Un jeton personnel en lecture seule : le cadrage lit les maquettes que le ticket cite."), secretField(context, "FIGMA_TOKEN", "Jeton", { secret: true })]) };
    case "services":
      return { title, rows: services(context) };
    case "image":
      return { title, rows: image(context) };
    case "claude":
      return { title, rows: claude(context) };
    case "memory":
      return { title, rows: memory(context) };
    case "registry":
      return { title, rows: registry(context) };
    case "voice":
      return { title, rows: voice(context) };
    case "settings":
      return { title, rows: settings(context) };
    case "check":
      return { title, rows: check(context) };
  }
}

// ---------------------------------------------------------------- services ----

function service(context: PageContext, id: ServiceId, rows: Row[]): Row[] {
  const snapshot = context.snapshot();
  if (!serviceOn(id, snapshot)) return [note("Desactive dans la section Services : son jeton n'est ni demande ni teste.", "warning"), ...rows];
  return [...rows, { kind: "action", label: "Tester la connexion", run: () => context.testService(id) }];
}

function secretField(context: PageContext, key: SecretKey, label: string, options: { readonly secret?: boolean; readonly placeholder?: string } = {}): Row {
  const snapshot = context.snapshot();
  const value = snapshot.secrets.get(key);
  return {
    kind: "field",
    label,
    value: value ? (options.secret ? masked(value) : value) : "",
    tone: value ? "info" : "muted",
    ...(snapshot.shell.has(key) ? { badge: "surcharge par le shell" } : {}),
    edit: {
      initial: snapshot.env.get(key) ?? "",
      ...(options.secret ? { secret: true } : {}),
      ...(options.placeholder ? { placeholder: options.placeholder } : {}),
      commit(text) {
        if (!text.trim()) throw new Error("Une valeur vide n'efface rien : retire la ligne de .env a la main.");
        writeSecret(snapshot.paths.env, key, text.trim());
        context.reload();
        const service = (["jira", "gitlab", "slack", "figma"] as const).find((id) => key.startsWith(id.toUpperCase()));
        if (service) context.testService(service);
      },
    },
  };
}

function services(context: PageContext): Row[] {
  const snapshot = context.snapshot();
  const switches = snapshot.settings?.services;
  if (!switches) return [note(snapshot.settingsError ?? "Reglages illisibles.", "error")];
  const toggle = (key: "slack" | "figma" | "jiraWrites", label: string, service: ServiceId | null): Row => ({
    kind: "toggle",
    label,
    on: switches[key],
    set(on) {
      writeSetting(snapshot.paths, ["services", key], on);
      context.reload();
      if (on && service) context.testService(service);
    },
  });
  return [
    note("Jira est toujours lu et GitLab toujours utilise. Un service coupe ne publie rien, et son jeton n'est plus demande."),
    toggle("slack", "Slack : canal et message", "slack"),
    toggle("figma", "Figma : maquettes du cadrage", "figma"),
    toggle("jiraWrites", "Jira : transition et commentaire", null),
  ];
}

// ------------------------------------------------------------ image, claude ----

function image(context: PageContext): Row[] {
  const name = context.snapshot().settings?.sandbox.image;
  if (!name) return [note("Reglages illisibles : le nom de l'image est inconnu.", "error")];
  return [
    note(`Les agents tournent dans l'image ${name}, construite depuis docker/agent.Dockerfile avec ton uid et ton gid.`),
    {
      kind: "action",
      label: "Construire l'image",
      async run() {
        const code = await context.handOff(() => buildImage(name), true);
        context.notify(code === 0 ? "success" : "error", code === 0 ? `${name} prete.` : "La construction a echoue : sa sortie est au-dessus, dans le terminal.");
        await context.probeImage();
      },
    },
    { kind: "action", label: "Verifier que Claude repond dans le conteneur", run: () => doctor(context) },
  ];
}

function claude(context: PageContext): Row[] {
  const snapshot = context.snapshot();
  const settings = snapshot.settings;
  if (!settings) return [note(snapshot.settingsError ?? "Reglages illisibles.", "error")];
  const mode = settings.agents.authentication;
  const rows: Row[] = [
    {
      kind: "choice",
      label: "Mode",
      value: mode,
      options: AUTH_MODES,
      set(value) {
        writeSetting(snapshot.paths, ["agents", "authentication"], value);
        context.reload();
      },
    },
    note(AUTH_LABELS[mode]),
  ];
  if (mode === "account") {
    if (authenticationProblem("account", snapshot.secrets)) {
      rows.push(
        note(
          `Aucun login Claude sur cette machine (${credentialsFile()}). redline copie ce fichier dans chaque conteneur et ne le reecrit jamais : un login cree pour redline seul n'est jamais rafraichi et finit par expirer. Le mode oauth donne un jeton longue duree.`,
          "warning",
        ),
        {
          kind: "action",
          label: "Passer en oauth et obtenir un jeton",
          async run() {
            writeSetting(snapshot.paths, ["agents", "authentication"], "oauth");
            context.reload();
            await setupToken(context);
          },
        },
      );
    } else rows.push(note(`Login trouve : ${credentialsFile()}. Il reste frais tant que tu utilises Claude Code sur cette machine.`, "success"));
  }
  if (mode === "oauth") {
    rows.push(secretField(context, "CLAUDE_CODE_OAUTH_TOKEN", "Jeton", { secret: true, placeholder: "sk-ant-oat01-…" }), { kind: "action", label: "Obtenir un jeton : claude setup-token dans le conteneur", run: () => setupToken(context) });
  }
  if (mode === "key") rows.push(note("Une cle creee sur console.anthropic.com, facturee a l'usage."), secretField(context, "ANTHROPIC_API_KEY", "Cle d'API", { secret: true, placeholder: "sk-ant-api03-…" }));
  rows.push({ kind: "action", label: "Tester : Claude repond dans le conteneur", run: () => doctor(context) });
  return rows;
}

/** claude setup-token runs in the agent image, where claude is always installed, and its token is read off the screen. */
async function setupToken(context: PageContext): Promise<void> {
  const snapshot = context.snapshot();
  const name = snapshot.settings?.sandbox.image;
  const probe = context.probes().image;
  if (!name || !probe || probe === "pending" || probe.state !== "present") throw new Error("L'image des agents doit exister : construis-la dans la section Image des agents.");
  const runtime = await runtimeStatus(snapshot.paths.home);
  if (!runtime.cli) throw new Error(runtime.detail);
  const cli = runtime.cli;
  const token = await context.handOff(async () => {
    const { output } = await runCaptured([cli, "run", "-it", "--rm", name, "claude", "setup-token"]);
    const found = oauthTokenIn(output);
    if (!found) {
      process.stdout.write("\nJeton non lu dans la sortie : copie-le, puis colle-le dans le champ Jeton.");
      await context.waitForEnter();
    }
    return found;
  }, false);
  if (!token) return context.notify("warning", "Jeton non lu : colle-le dans le champ Jeton.");
  writeSecret(snapshot.paths.env, "CLAUDE_CODE_OAUTH_TOKEN", token);
  context.reload();
  context.notify("success", `Jeton enregistre dans ${snapshot.paths.env}.`);
}

async function doctor(context: PageContext): Promise<void> {
  const code = await context.handOff(() => imageDoctorCommand(), true);
  context.notify(code === 0 ? "success" : "error", code === 0 ? "Claude repond dans le conteneur." : "Claude ne repond pas : la sortie du doctor est au-dessus, dans le terminal.");
}

// ------------------------------------------------------------------- memory ----

function memory(context: PageContext): Row[] {
  const snapshot = context.snapshot();
  const current = snapshot.memory;
  if (!current || !snapshot.settings) return [note(snapshot.settingsError ?? "Reglages illisibles.", "error")];
  const rows: Row[] = [
    note(current.separate ? `Depot propre : ${current.url ?? current.directory} (${snapshot.notes} note(s)).` : `Dans le home, versionnee avec les tickets : ${current.directory} (${snapshot.notes} note(s)).`),
  ];
  if (snapshot.running.length > 0) return [...rows, note(`Runs en cours (${snapshot.running.join(", ")}) : la memoire ne bouge pas tant qu'ils tournent.`, "warning")];
  if (current.separate) {
    return [
      ...rows,
      note("Pour la remettre dans le home ou changer de depot, edite memory dans redline.yaml."),
      {
        kind: "action",
        label: "Tirer les notes des autres maintenant",
        async run() {
          const warning = await pullMemory(current);
          context.reload();
          context.notify(warning ? "warning" : "success", warning ?? "Memoire a jour.");
        },
      },
    ];
  }
  const draft = context.drafts.memory;
  const committer = snapshot.settings.git.committer;
  return [
    ...rows,
    { kind: "heading", text: "La donner a son propre depot git, partageable avec l'equipe" },
    {
      kind: "field",
      label: "URL du depot",
      value: draft.url,
      tone: "info",
      edit: {
        initial: draft.url,
        placeholder: "git@gitlab.com:equipe/memoire.git",
        commit(text) {
          draft.url = text.trim();
          if (draft.url) draft.path = "";
        },
      },
    },
    {
      kind: "field",
      label: "ou chemin d'un clone",
      value: draft.path,
      tone: "info",
      edit: {
        initial: draft.path,
        placeholder: "~/code/memoire",
        commit(text) {
          draft.path = text.trim();
          if (draft.path) draft.url = "";
        },
      },
    },
    {
      kind: "toggle",
      label: `Importer les ${snapshot.notes} note(s) du home`,
      on: draft.importNotes,
      set(on) {
        draft.importNotes = on;
      },
    },
    {
      kind: "action",
      label: "Raccorder",
      detail: "les notes du home sont archivees, et le home ne versionne plus que les tickets",
      async run() {
        if (!draft.url && !draft.path) throw new Error("Donne l'URL du depot, ou le chemin d'un clone.");
        const target = draft.url ? { url: draft.url } : { path: draft.path };
        const result = await connectMemory(snapshot.paths, target, { importNotes: draft.importNotes, committer });
        writeSetting(snapshot.paths, draft.url ? ["memory", "repository"] : ["memory", "path"], draft.url || draft.path);
        context.reload();
        const parts = [`${result.imported.length} note(s) importee(s)`, ...(result.skipped.length ? [`${result.skipped.length} deja presente(s), laissee(s) telle(s) quelle(s)`] : []), ...(result.archived ? [`anciennes notes archivees dans ${result.archived}`] : [])];
        context.notify(result.warning ? "warning" : "success", `Memoire raccordee : ${parts.join(", ")}.${result.warning ? ` ${result.warning}` : ""}`);
      },
    },
  ];
}

// ----------------------------------------------------------------- registry ----

function registry(context: PageContext): Row[] {
  const snapshot = context.snapshot();
  const rows: Row[] = [];
  if (snapshot.registryError) rows.push(note(snapshot.registryError, "error"));
  if (context.drafts.registryBackup !== null) {
    rows.push({
      kind: "action",
      label: "Restaurer le registre d'avant l'editeur",
      run() {
        writeFileSync(snapshot.paths.registry, context.drafts.registryBackup ?? "", "utf8");
        context.drafts.registryBackup = null;
        context.reload();
        context.notify("success", "Registre restaure.");
      },
    });
  }
  for (const repo of snapshot.registry?.repositories ?? []) {
    const declared = COMMAND_KINDS.filter((kind) => repo.commands[kind] !== null);
    rows.push({ kind: "action", label: repo.name, detail: `level ${repo.level} · ${declared.length ? declared.join(", ") : "aucune commande"}`, run: () => context.open(() => repositoryPage(context, repo.name)) });
  }
  rows.push(
    {
      kind: "field",
      label: "Ajouter un depot",
      value: "",
      edit: {
        initial: "",
        placeholder: "chemin du checkout, par exemple ~/code/app",
        async commit(path) {
          const { entry, guessed } = await detectRepository(path.trim());
          addRepository(snapshot.paths, entry);
          context.reload();
          context.open(() => repositoryPage(context, entry.name));
          context.notify(guessed.length ? "warning" : "success", guessed.length ? `${entry.name} ajoute : verifie ${guessed.join(", ")}, devine(s).` : `${entry.name} ajoute : declare ses commandes.`);
        },
      },
    },
    { kind: "action", label: "Editer repositories.yaml dans l'editeur", run: () => editRegistry(context) },
    note("Les commandes se tapent a la main : redline n'en deduit aucune d'un outil detecte. Une commande null interdit ce type de verification dans ce depot."),
  );
  return rows;
}

function repositoryPage(context: PageContext, name: string): Page {
  const snapshot = context.snapshot();
  const repo = snapshot.registry?.repositories.find((entry) => entry.name === name);
  if (!repo) return { title: name, rows: [note("Ce depot n'est plus dans le registre.", "warning")] };
  const set = (field: readonly [RepoField, ...string[]], value: unknown) => {
    setRepositoryField(snapshot.paths, name, field, value);
    context.reload();
  };
  const others = { ...snapshot.registry, repositories: snapshot.registry?.repositories.filter((entry) => entry.name !== name) ?? [] } as NonNullable<SetupSnapshot["registry"]>;
  const minimum = proposedLevel(others, repo.dependsOn);
  const text = (label: string, field: RepoField, options: { list?: boolean; nullable?: boolean } = {}): Row => ({
    kind: "field",
    label,
    value: formatValue(repo[field]),
    edit: {
      initial: formatValue(repo[field]),
      commit(value) {
        const trimmed = value.trim();
        set([field], options.list ? trimmed.split(",").map((item) => item.trim()).filter(Boolean) : options.nullable && !trimmed ? null : trimmed);
      },
    },
  });
  const choice = (label: string, field: "layer" | "packageManager", options: readonly string[]): Row => ({ kind: "choice", label, value: repo[field], options, set: (value) => set([field], value) });
  const path = expandTilde(repo.path);
  const rows: Row[] = [
    ...(existsSync(path) ? [] : [note(`${path} absent du disque : les scouts ne pourront pas le lire.`, "warning")]),
    text("Chemin du checkout", "path"),
    text("Projet GitLab", "gitlabProject"),
    text("Branche de base", "baseBranch"),
    choice("Couche", "layer", ["front", "backend", "data", "eval"]),
    choice("Gestionnaire de paquets", "packageManager", ["npm", "pnpm", "yarn", "bun"]),
    { kind: "choice", label: "Monorepo", value: repo.monorepoTool ?? "aucun", options: ["aucun", "turbo", "lerna"], set: (value) => set(["monorepoTool"], value === "aucun" ? null : value) },
    text("Paquet publie", "packageName", { nullable: true }),
    {
      kind: "field",
      label: "Depend de",
      value: repo.dependsOn.join(", "),
      edit: {
        initial: repo.dependsOn.join(", "),
        placeholder: "noms de depots du registre, separes par des virgules",
        commit(value) {
          const dependsOn = value.split(",").map((item) => item.trim()).filter(Boolean);
          const level = proposedLevel(others, dependsOn);
          if (repo.level < level) setRepositoryField(snapshot.paths, name, ["level"], level);
          set(["dependsOn"], dependsOn);
        },
      },
    },
    {
      kind: "field",
      label: "Level",
      value: String(repo.level),
      ...(repo.level > minimum ? { badge: `minimum ${minimum}` } : {}),
      edit: {
        initial: String(repo.level),
        commit(value) {
          const parsed = parseInput({ kind: "number", integer: true, min: 0 }, value, false);
          if ("error" in parsed) throw new Error(`Level : ${parsed.error}.`);
          set(["level"], parsed.value);
        },
      },
    },
    text("Description", "description"),
    text("Mots-cles", "keywords", { list: true }),
    text("Jobs CI a surveiller", "ciJobsToWatch", { list: true }),
    { kind: "heading", text: "Commandes — tapees a la main, vide = n'existe pas ici" },
    ...COMMAND_KINDS.map((kind): Row => ({
      kind: "field",
      label: kind,
      value: repo.commands[kind] ?? "",
      tone: repo.commands[kind] ? "info" : "muted",
      edit: { initial: repo.commands[kind] ?? "", commit: (value) => set(["commands", kind], value.trim() || null) },
    })),
    ...COMMAND_KINDS.filter((kind) => repo.commands[kind] !== null).map((kind): Row => ({ kind: "action", label: `Essayer ${kind}`, detail: repo.commands[kind] ?? "", run: () => tryCommand(context, repo, kind) })),
    note(TEST_KINDS.some((kind) => repo.commands[kind] !== null) ? "" : "Aucune commande de test : withoutTests est pose, et un plan qui demande un test ici sera refuse."),
    { kind: "heading", text: "Le reste" },
    { kind: "action", label: "Cles avancees dans l'editeur", detail: "localFiles, containers, reports, targeting, release, bump", run: () => editRegistry(context) },
    {
      kind: "action",
      label: context.drafts.removing === name ? "Retirer ce depot : Entree encore pour confirmer" : "Retirer ce depot",
      run() {
        if (context.drafts.removing !== name) {
          context.drafts.removing = name;
          return;
        }
        context.drafts.removing = null;
        removeRepository(snapshot.paths, name);
        context.reload();
        context.notify("success", `${name} retire du registre.`);
      },
    },
  ];
  return { title: `Registre · ${name}`, rows: rows.filter((row) => row.kind !== "note" || row.text !== "") };
}

/** Runs a command as a run would, in the checkout as it is, and says how long it took and how long it stayed silent. */
async function tryCommand(context: PageContext, repo: RepoEntry, kind: CommandKind): Promise<void> {
  const { paths, settings } = context.snapshot();
  if (!settings) throw new Error("Reglages illisibles.");
  const runner = createCheckRunner({ commandSeconds: settings.timeouts.commandSeconds, silenceSeconds: settings.timeouts.commandSilenceSeconds, logDirectory: logDirectory(paths, "init") });
  const result = await runner.run(repo, kind, expandTilde(repo.path), { label: `init-${repo.name}-${kind}` });
  const seconds = (ms: number) => `${(ms / 1000).toFixed(1)} s`;
  const timing = `${seconds(result.durationMs)}, plus long silence ${seconds(result.maxSilentMs)}`;
  context.notify(result.passed ? "success" : "error", result.passed ? `✓ ${repo.name} ${kind} — ${timing}` : `✗ ${repo.name} ${kind} — code ${result.exitCode} apres ${timing}${result.stopReason ? ` — ${result.stopReason}` : ""}${result.logPath ? ` · ${result.logPath}` : ""}`);
}

/** The whole registry in the human's editor, checked when the editor closes; the version before stays at hand. */
async function editRegistry(context: PageContext): Promise<void> {
  const { paths } = context.snapshot();
  if (!existsSync(paths.registry)) writeFileSync(paths.registry, "schemaVersion: 1\nrepositories: []\n", "utf8");
  const before = readFileSync(paths.registry, "utf8");
  await context.handOff(() => openEditor(paths.registry), false);
  context.reload();
  const error = context.snapshot().registryError;
  if (error) {
    context.drafts.registryBackup = before;
    context.notify("error", `repositories.yaml invalide : ${error.split("\n")[0]}`);
  } else {
    context.drafts.registryBackup = null;
    context.notify("success", "Registre valide.");
  }
}

// -------------------------------------------------------- voice, settings ----

function voice(context: PageContext): Row[] {
  const { paths, voice: calibrated } = context.snapshot();
  return [
    note(calibrated ? "voice.md existe : le finalizer ecrit dans ta voix." : "Pas encore de voice.md : le finalizer reste factuel et n'imite aucun style.", calibrated ? "success" : "warning"),
    note(
      "Pour la calibrer : rassemble quelques centaines de lignes que tu as ecrites — commentaires de MR, messages Slack, commits —, donne-les a Claude avec le prompt de docs/setup.md, section 8, puis relis et corrige le profil. Un profil que tu n'as pas relu publiera ce que tu n'aurais pas ecrit.",
    ),
    {
      kind: "action",
      label: "Ouvrir voice.md dans l'editeur",
      detail: calibrated ? "" : "part du modele",
      async run() {
        if (!existsSync(paths.voice)) copyFileSync(join(TEMPLATES, "voice.template.md"), paths.voice);
        await context.handOff(() => openEditor(paths.voice), false);
        context.reload();
      },
    },
  ];
}

function settings(context: PageContext): Row[] {
  const snapshot = context.snapshot();
  if (!snapshot.settings) {
    return [
      note(snapshot.settingsError ?? "Reglages illisibles.", "error"),
      {
        kind: "action",
        label: "Ouvrir redline.yaml dans l'editeur",
        async run() {
          await context.handOff(() => openEditor(snapshot.paths.settings), false);
          context.reload();
        },
      },
    ];
  }
  const write = (path: Path, value: unknown) => {
    if (value === undefined) resetSetting(snapshot.paths, path);
    else writeSetting(snapshot.paths, path, value);
    context.reload();
  };
  const rows: Row[] = [note("Une valeur que tu changes devient une surcharge du defaut du paquet ; r la remet au defaut.")];
  for (const row of settingRows(SettingsSchema, snapshot.settings, snapshot.defaults, snapshot.overrides, SKIP)) {
    if (row.type === "heading") {
      rows.push({ kind: "heading", text: row.path.join(".") });
      continue;
    }
    if (row.type === "entry") {
      rows.push({
        kind: "field",
        label: "+ ajouter",
        value: row.keys ? row.keys.join(", ") : "",
        tone: "muted",
        edit: {
          initial: "",
          placeholder: row.keys ? `une cle parmi : ${row.keys.join(", ")}` : "la cle, par exemple un prefixe de ticket Jira",
          commit(key) {
            const name = key.trim();
            if (!name || (row.keys && !row.keys.includes(name))) throw new Error(row.keys ? `Une cle parmi : ${row.keys.join(", ")}.` : "Une cle vide ne designe rien.");
            write([...row.path, name], seedFor(row.path, snapshot.settings));
          },
        },
      });
      continue;
    }
    const label = row.path.at(-1) ?? "";
    const reset = row.overridden ? { reset: () => write(row.path, undefined) } : {};
    const badge = row.overridden ? { badge: `defaut ${formatValue(row.fallback) || "aucun"}` } : {};
    rows.push(fieldFor(row.input, row.optional, label, row.value, row.overridden, (value) => write(row.path, value), reset, badge));
  }
  return rows;
}

function fieldFor(input: Input, optional: boolean, label: string, value: unknown, overridden: boolean, set: (value: unknown) => void, reset: object, badge: object): Row {
  if (input.kind === "boolean") return { kind: "toggle", label, on: value === true, set, ...reset };
  if (input.kind === "choice" && !optional) return { kind: "choice", label, value: String(value), options: input.options, set, ...reset };
  return {
    kind: "field",
    label,
    value: formatValue(value),
    tone: overridden ? "info" : "muted",
    ...badge,
    ...reset,
    edit: {
      initial: formatValue(value),
      ...(input.kind === "choice" ? { placeholder: input.options.join(" | ") } : {}),
      commit(text) {
        const parsed = parseInput(input, text, optional);
        if ("error" in parsed) throw new Error(`${label} : ${parsed.error}.`);
        set(parsed.value);
      },
    },
  };
}

// -------------------------------------------------------------------- check ----

function check(context: PageContext): Row[] {
  const rows: Row[] = [{ kind: "action", label: "Lancer la verification", detail: "comme bun redline check", run: () => context.runCheck() }];
  const findings = context.findings();
  if (!findings) return [...rows, note("Elle relit tout, demande a chaque service a qui sont les jetons, regarde Docker, l'image, les identifiants de Claude et les checkouts du registre.")];
  for (const [section, entries] of Map.groupBy(findings, (finding) => finding.section)) {
    rows.push({ kind: "heading", text: section });
    for (const finding of entries) rows.push(note(`${finding.status === "ok" ? "✓" : finding.status === "warn" ? "!" : "✗"} ${finding.label} — ${finding.detail}`, finding.status === "ok" ? "success" : finding.status === "warn" ? "warning" : "error"));
  }
  return rows;
}

function note(text: string, tone: Tone | "muted" = "muted"): Row {
  return { kind: "note", text, tone };
}

function masked(value: string): string {
  return value.length <= 8 ? "••••" : `••••${value.slice(-4)}`;
}
