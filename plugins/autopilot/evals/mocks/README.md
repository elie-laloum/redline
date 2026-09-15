# Faux serveurs MCP

Vide, et volontairement.

`--mocks record` — le defaut — **ne demarre pas** un serveur de plugin qui n'a pas de mock.
Un agent de l'autopilot dont tous les tools viennent du serveur `autopilot` part alors avec
zero tool, et le spawn est refuse avant meme de commencer :

```
Agent 'autopilot:doc-scout' would be spawned with zero tools — refusing.
unrecognized [mcp__plugin_autopilot_autopilot__get-ticket, …]
```

C'est un bon refus — mieux vaut ca qu'une synthese hallucinee — mais il rend chaque suite
inevaluable.

## Pourquoi on demarre le vrai serveur

`pnpm eval` passe donc `--allow-real-servers`. Trois raisons :

1. **Le serveur est le notre.** Ce n'est pas une dependance tierce dont on ignore ce qu'elle
   fait au demarrage.
2. **Le perimetre est borne par `allowed_tools`**, pas par le serveur. Chaque `prompt.md` ne
   liste que des tools en lecture : `get-memory`, `get-repositories-registry`,
   `get-autopilot-config`, `get-store-ticket`, `writer-voice-tone`, `ask-user`. Aucun
   `push-tag`, aucun `create-gitlab-mr`, aucun `create-slack-channel` n'est accessible, meme
   si un agent decidait d'essayer.
3. **Les cas n'ont pas besoin de donnees vivantes.** Le materiel — ticket, extraits de code,
   notes de memoire — est fourni **dans le prompt**. Ce qu'on evalue, c'est un jugement, pas
   une capacite a lire un disque. Les tools doivent exister, pas repondre juste.

`ask-user` merite une mention : sans live shell et sans elicitation, il rend la question a
l'appelant au lieu de bloquer. C'est le troisieme transport, et c'est exactement ce qu'on
veut en eval — le cas ne se fige pas sur une question sans reponse.

## Quand il faudra remplir ce dossier

Le jour ou une suite aura besoin d'un etat precis — un ticket Jira dans un statut donne, un
pipeline GitLab a un verdict donne. A ce moment-la, enregistrer sur le projet de test `TJ`
uniquement : un enregistrement fait sur un vrai ticket le transitionnerait pour de bon.
