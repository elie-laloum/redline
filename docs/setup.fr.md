# Installation

[English](setup.md) · [Présentation](../README.fr.md)

## Examiner et tester

Depuis la racine, sous Ubuntu/WSL ou un environnement Unix adapté, avec Git, Node 22.18+ et pnpm :

```bash
pnpm install --frozen-lockfile
pnpm test
pnpm test:workflow
pnpm --dir tools/live-shell install --frozen-lockfile
pnpm typecheck
```

Les dépendances de la racine et de la vue live s'installent séparément. Construire ensuite l'interface facultative avec `pnpm live:build`.

## Configurer une exécution réelle

Copier chaque modèle uniquement si sa destination n'existe pas :

```bash
cp -n .env.example .env
cp -n autopilot.example.yaml autopilot.yaml
cp -n repositories.example.yaml repositories.yaml
cp -n plugins/autopilot/rules/voice.template.md plugins/autopilot/rules/voice.md
```

Renseigner les vrais chemins, projets GitLab, branches de base, niveaux de dépendance et commandes vérifiées dans le registre. Une commande de test `null` signifie que cette famille de tests est indisponible ; ne pas en inventer une. Configurer les budgets, noms, transitions Jira et invitations Slack dans `autopilot.yaml`.

Les intégrations actuelles nécessitent des accès Jira Cloud, GitLab et Slack. Slack attend un jeton utilisateur ; Figma reste facultatif. Examiner les actions de publication, qui peuvent apparaître sous votre compte. Le profil rédactionnel personnel va dans `voice.md`, ignoré par Git ; garder le modèle public générique.

```bash
pnpm config:check
```

Sur une copie non configurée, cette commande signale les accès obligatoires absents et peut échouer. Les tests unitaires ne valident pas la configuration d'une exécution réelle.

## Charger le plugin

Le dépôt fournit une marketplace locale dans `.claude-plugin/marketplace.json` et le manifeste du plugin dans `plugins/autopilot/.claude-plugin/plugin.json`. Enregistrer cette marketplace et activer le plugin `autopilot` dans le gestionnaire de plugins de votre version de Claude Code. Vérifier le serveur MCP et le skill `autopilot-start` avant de lancer un ticket. Ce chargement n'a pas été exécuté pendant cette mise à jour documentaire.

Les permissions d'exemple utilisent l'espace de noms `autopilot` : les examiner avant utilisation et conserver ces identifiants pendant le changement de nom public.

## État et reprise

Le dossier `~/.autopilot` conserve la mémoire et les tickets versionnés, ainsi que les événements, verrous et worktrees temporaires. Relancer un ticket existant reprend son état enregistré. Examiner la documentation de nettoyage du skill avant d'utiliser `--clear`, qui ne constitue pas une reprise.

Le [guide Autopilot original](autopilot-reference.md) conserve les détails sur le profil rédactionnel. En cas de différence, suivre le présent guide d'installation.
