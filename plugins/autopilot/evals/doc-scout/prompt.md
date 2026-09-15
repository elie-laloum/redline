---
max_turns: 12
allowed_tools: [Read, Glob, Grep, Agent, mcp__plugin_autopilot_autopilot__get-memory, mcp__plugin_autopilot_autopilot__get-repositories-registry]
---

Invoque l'agent `doc-scout` pour sa passe large (point 3) sur le ticket ci-dessous, puis
rends-moi sa synthese telle quelle.

Ticket FT-1025 — Ajouter le filtre par periode sur les feuilles de lab
> Les comptables veulent filtrer les feuilles de travail du lab par periode. Aujourd'hui la
> liste rend tout, et sur un gros dossier c'est inutilisable.

La memoire contient, entre autres, ces notes :

| Chemin | Contenu |
|---|---|
| `features/sheet-lab/liste.md` | La liste des feuilles est paginee cote serveur, 50 par page |
| `features/sheet-lab/filtres.md` | Un filtre par statut existe deja, il passe par un query param |
| `repos/web-app/conventions-tests.md` | Le repo tourne sous rstest |
| `repos/sheet-service/endpoints.md` | `GET /sheets` accepte `status`, pas `period` |
| `integrations/worksheet-stack.md` | web-app appelle sheet-service via api-client |
| `capabilities/dates.md` | Un helper `periodRange` existe dans `@front/helpers` |
| `company/accessibilite.md` | Tous les filtres doivent etre atteignables au clavier |
| `changes/FT-0912.md` | Historique du filtre par statut |
| `domains/compliance/lab.md` | Une feuille de lab est rattachee a un exercice comptable |
| … et une quinzaine d'autres notes sans rapport (design system, facturation, RH) |

La memoire ne dit **rien** sur la pagination combinee a un filtre, ni sur ce qui se passe
quand la periode chevauche deux exercices.
