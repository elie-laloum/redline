---
max_turns: 14
allowed_tools: [Read, Glob, Grep, Agent, mcp__plugin_autopilot_autopilot__get-memory, mcp__plugin_autopilot_autopilot__ask-user]
---

Invoque l'agent `functional-grill` sur le ticket ci-dessous. Rends-moi ses questions et ses
arbitrages. Tu peux repondre a sa place, en te contentant de ce que le materiel ci-dessous
permet de savoir.

Ticket FT-1025 — Ajouter le filtre par periode sur les feuilles de lab
> Le comptable choisit une periode et la liste ne montre que les feuilles de cette periode.
> Par defaut, on affiche le **dernier mois clos**.

Maquette Figma (description) — le selecteur de periode est pre-rempli avec **le mois en
cours**, et un bouton « tout voir » est visible a cote.

Memoire :
- `features/sheet-lab/filtres.md` — le filtre par statut existant n'a **pas** de bouton
  de reinitialisation, on repasse par « tous les statuts » dans le menu
- `domains/compliance/lab.md` — une feuille est rattachee a un exercice comptable, et un
  exercice ne coincide pas toujours avec l'annee civile
