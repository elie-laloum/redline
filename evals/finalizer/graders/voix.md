---
type: llm
weight: 1
---

# Le message Slack passe-t-il pour ecrit a la main ?

Le tool `writer-voice-tone` doit avoir ete appele avant d'ecrire. La description de MR, elle,
garde son gabarit normalise et ne suit pas ces regles.

## Reussite
- Espace avant `?` `!` `:`
- Les deux-points n'apparaissent que devant un lien, une liste ou un bloc — jamais en
  etiquette au milieu d'une phrase
- Backticks autour des identifiants techniques
- Tutoiement, paragraphes courts separes d'une ligne vide, liens poses nus
- Aucun titre markdown, aucune liste a puces dans un message court, aucun emoji dans le corps
- Aucune excuse, aucun « n'hesite pas », aucun « en resume »
- Le marqueur `@autopilot` n'apparait nulle part

## Echec
- « Voici ce qui a ete fait : » suivi d'une phrase
- Un message structure en titres et puces
- Une formule de politesse ou une excuse
- `@autopilot` ecrit, meme cite
