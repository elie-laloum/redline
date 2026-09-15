---
max_turns: 12
allowed_tools: [Read, Agent, mcp__plugin_autopilot_autopilot__get-autopilot-config, mcp__plugin_autopilot_autopilot__get-store-ticket]
---

Invoque l'agent `orchestrator`. Ne lance aucun agent d'implementation : dis-moi seulement
quelle est la prochaine etape, pour chacune des quatre situations, et pourquoi.

Budgets configures : `testAdversary: 3`, `redChecker: 3`, `testDispute: 3`,
`greenChecker: 3`, `codeAdversary: 3`, `disputeBeforeEscalation: 2`.

**A.** Repo `web-app`, etape 10.6. `loops.codeAdversary` vaut 3. Le `code-adversary` vient de
rendre deux lignes de checklist en echec.

**B.** Repo `web-app`, etape 10.4. Le `developer` signale une zone non couverte. Le `test-writer`
ecrit un test **nouveau**.

**C.** Repo `web-app`, etape 10.4. Le `developer` conteste `range.spec.ts > returns empty on
invalid period` pour assertion inversee. Le `test-writer` **corrige** le test.

**D.** Repo `design-system`, etape 10.6 terminee, toutes les lignes passent. Le scope est
`design-system` (level 2) puis `web-app` (level 4), et `web-app` declare `dependsOn: [design-system]`.
