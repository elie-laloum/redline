import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { createServer } from "node:net";
import { loadConfig } from "../lib/config.ts";
import {
  type LiveEvent,
  appendEvent,
  broadcast,
  nextSeq,
  readLiveSession,
  validateEvent,
  writeLiveSession,
} from "../lib/events.ts";
import { fail } from "../lib/errors.ts";
import { liveShellDir } from "../lib/paths.ts";
import { anyValue, arr, enumOf, obj, str } from "../lib/schema.ts";
import { patchTicketState } from "../lib/store.ts";
import { type AnyTool, type ToolContext, defineTool } from "../lib/tool.ts";
import { LIVE_EVENT_KINDS, LIVE_EVENT_STATUSES } from "../lib/events.ts";

export const humanTools: AnyTool[] = [
  defineTool({
    name: "ask-user",
    description:
      "Pose un LOT de questions a l'humain et BLOQUE jusqu'aux reponses. C'est volontaire : le workflow ne doit pas avancer pendant qu'il attend un arbitrage. Groupe tout ce que tu peux demander au meme moment — trois questions posees separement, c'est trois arrets la ou un seul suffit. Chaque question porte trois ou quatre options ; un champ libre est toujours offert en plus, tu n'as pas a le prevoir. Deux transports, une seule interface : le live shell quand il tourne, le terminal sinon. N'essaie jamais de choisir le transport toi-meme.",
    inputSchema: obj(
      {
        ticketId: str("Cle Jira, elle rattache les questions au run."),
        questions: arr(
          "Les questions a poser en une fois. Regroupe tout ce qui peut etre tranche au meme moment.",
          obj(
            {
              key: str("Identifiant court et stable, c'est lui qui rapporte la reponse. Par exemple `periode-defaut`."),
              header: str("Deux ou trois mots, affiches en etiquette. Par exemple `Periode par defaut`."),
              question: str("La question, complete et lisible seule. Donne le contexte, ne renvoie pas a un message precedent."),
              options: arr(
                "Trois ou quatre reponses plausibles, formulees pour etre choisies telles quelles. Un champ libre s'ajoute tout seul.",
                str("Une option."),
              ),
            },
            ["key", "header", "question"],
            { description: "Une question du lot." },
          ),
        ),
        askedBy: str("Nom de l'agent qui pose les questions."),
      },
      ["ticketId", "questions"],
    ),
    handler: async (
      input: {
        ticketId: string;
        questions: { key: string; header: string; question: string; options?: string[] }[];
        askedBy?: string;
      },
      context: ToolContext,
    ) => {
      const asked = new Date().toISOString();
      const session = readLiveSession(input.ticketId);
      const timeoutMs = loadConfig().timeouts.askUserSeconds * 1000;

      const questions = input.questions.map((entry, index) => ({
        key: entry.key?.trim() || `q${index + 1}`,
        header: entry.header?.trim() || `Question ${index + 1}`,
        question: entry.question.trim(),
        options: (entry.options ?? []).filter(Boolean),
      }));

      if (questions.length === 0) fail("`questions` est vide.", "Pose au moins une question.");
      const thin = questions.filter((entry) => entry.options.length > 0 && entry.options.length < 2);
      if (thin.length > 0) {
        fail(
          `Une seule option proposee sur : ${thin.map((entry) => entry.key).join(", ")}.`,
          "Une option unique n'est pas un choix. Donnes-en trois ou quatre, ou aucune.",
        );
      }

      await record(input.ticketId, {
        kind: "question",
        status: "waiting",
        agent: input.askedBy ?? null,
        title:
          questions.length === 1
            ? truncate(questions[0]?.question ?? "", 180)
            : `${questions.length} questions : ${questions.map((entry) => entry.header).join(", ")}`,
        detail: questions
          .map((entry) => `${entry.header} — ${entry.question}${entry.options.length ? `\n  Options : ${entry.options.join(" | ")}` : ""}`)
          .join("\n\n"),
        payload: { questions },
      });

      // Transport 1 : le live shell, quand il tourne.
      if (session) {
        const answers = await askLiveShell(session.url, { questions, askedBy: input.askedBy ?? null }, timeoutMs);
        if (answers) {
          await finishQuestion(input.ticketId, input.askedBy ?? null, answers, "live");
          return { answers, transport: "live", askedAt: asked };
        }
      }

      // Transport 2 : le terminal, par elicitation. C'est aussi le repli quand
      // le live shell ne repond plus. Un champ par question, en une seule
      // invite : le lot reste un lot.
      if (context.canAskHuman) {
        const fields: Record<string, { title: string; description?: string }> = {};
        for (const entry of questions) {
          fields[entry.key] = {
            title: entry.header,
            description: entry.options.length > 0 ? entry.options.join(" | ") : undefined,
          };
        }
        const result = await context.askHuman(formatQuestions(questions), fields);
        if (result.action === "accept" && result.content) {
          const answers: Record<string, string> = {};
          for (const entry of questions) answers[entry.key] = String(result.content[entry.key] ?? "").trim();
          const missing = questions.filter((entry) => !answers[entry.key]).map((entry) => entry.key);
          if (missing.length === 0) {
            await finishQuestion(input.ticketId, input.askedBy ?? null, answers, "terminal");
            return { answers, transport: "terminal", askedAt: asked };
          }
          return {
            answers,
            transport: "terminal",
            incomplete: missing,
            note: `Sans reponse sur ${missing.join(", ")}, n'avance pas sur une hypothese : repose la question ou escalade.`,
          };
        }
        return {
          answers: null,
          transport: "terminal",
          declined: true,
          note: "L'humain n'a pas repondu. N'avance pas sur une hypothese : reformule, ou escalade.",
        };
      }

      // Transport 3 : aucun canal direct. On rend les questions a l'agent
      // appelant, qui les posera dans le fil. L'interface reste la meme.
      return {
        answers: null,
        transport: "caller",
        questions,
        note: "Aucun canal direct disponible. Pose ces questions telles quelles a l'humain, en proposant les options, puis poursuis une fois les reponses obtenues.",
      };
    },
  }),

  defineTool({
    name: "escalate-to-human",
    description:
      "Arrete le run et rend la main. Ce n'est pas une question, c'est un arret : budget de boucle epuise, timeout CI, meme test conteste deux fois. Jamais d'abandon silencieux, jamais de livraison en l'etat.",
    inputSchema: obj(
      {
        ticketId: str("Cle Jira."),
        reason: str("Ce qui bloque, en une phrase factuelle."),
        step: str("Point exact du workflow, par exemple 10.6."),
        repo: str("Repo concerne, s'il y en a un."),
        detail: str("Le detail utile pour reprendre a la main : compteurs, derniers retours, sorties de test."),
      },
      ["ticketId", "reason", "step"],
    ),
    handler: async (input: { ticketId: string; reason: string; step: string; repo?: string; detail?: string }) => {
      const at = new Date().toISOString();
      patchTicketState(input.ticketId, {
        run: {
          phase: "escalated",
          escalation: { at, step: input.step, repo: input.repo ?? null, reason: input.reason },
        },
        metrics: { humanInterventions: { __increment: 1 } },
      });
      await record(input.ticketId, {
        kind: "escalation",
        status: "ko",
        repo: input.repo ?? null,
        title: `Escalade au point ${input.step} : ${truncate(input.reason, 120)}`,
        detail: input.detail ?? null,
        payload: { step: input.step, repo: input.repo ?? null },
      });
      return {
        escalated: true,
        at,
        note: "Rien n'est publie : ni MR, ni canal, ni transition. Les commits et les tags deja poses restent en place. Relancer /autopilot-start reprendra ici.",
      };
    },
  }),

  defineTool({
    name: "launch-live-mode",
    description:
      "Demarre le live shell sur un port libre de la plage configuree et l'ouvre dans le navigateur. A appeler AVANT le point 1 quand le run est lance avec --live. Le shell est une fenetre sur le run, jamais un pilote : s'il meurt, le run continue.",
    inputSchema: obj({ ticketId: str("Cle Jira."), runId: str("Identifiant du run.") }, ["ticketId", "runId"]),
    handler: async ({ ticketId, runId }: { ticketId: string; runId: string }) => {
      const existing = readLiveSession(ticketId);
      if (existing && (await isAlive(existing.url))) {
        return { launched: false, reused: true, url: existing.url, runId: existing.runId };
      }

      const directory = liveShellDir();
      if (!existsSync(directory)) fail(`Live shell introuvable a ${directory}.`);

      const { portRange, openBrowser } = loadConfig().liveMode;
      const port = await findFreePort(portRange[0], portRange[1]);
      const url = `http://127.0.0.1:${port}`;

      const child = spawn("pnpm", ["run", "start", "--port", String(port)], {
        cwd: directory,
        detached: true,
        stdio: "ignore",
        env: { ...process.env, PORT: String(port), AUTOPILOT_TICKET_ID: ticketId, AUTOPILOT_RUN_ID: runId },
      });
      child.unref();

      const ready = await waitFor(url, 60_000);
      writeLiveSession({ runId, ticketId, port, url, pid: child.pid ?? -1, startedAt: new Date().toISOString() });
      patchTicketState(ticketId, { run: { liveRunId: runId } });

      if (ready && openBrowser) {
        spawn("open", [url], { detached: true, stdio: "ignore" }).unref();
      }

      return {
        launched: true,
        url,
        port,
        ready,
        note: ready
          ? "Le shell rejoue l'historique d'events avant de se brancher sur le direct."
          : "Le shell n'a pas repondu a temps. Le run continue sans lui : ce n'est pas un point de defaillance.",
      };
    },
  }),

  defineTool({
    name: "push-live-mode-event",
    description:
      "Pousse un event dans le flux du run. A appeler par CHAQUE agent au moment ou il fait quelque chose : prise de main, changement de tool, resultat, fin. Il n'y a pas de cablage central — un agent qui ne pousse pas laisse un trou dans l'interface. `title` doit se lire seul : « en cours » est un event rate.",
    inputSchema: obj(
      {
        ticketId: str("Cle Jira."),
        runId: str("Identifiant du run. Omis, celui de la session live est repris."),
        kind: enumOf("Nature de l'event.", LIVE_EVENT_KINDS),
        status: enumOf("Ou en est l'action.", LIVE_EVENT_STATUSES),
        title: str("Une ligne, lisible telle quelle dans l'interface."),
        detail: str("Texte long, replie par defaut dans l'interface."),
        agent: str("Nom de l'agent."),
        tool: str("Nom du tool en cours."),
        repo: str("Repo courant du cycle 10.x."),
        payload: anyValue("Donnee structuree propre au kind : compteur et budget, lignes de checklist, todo list."),
      },
      ["ticketId", "kind", "status", "title"],
    ),
    handler: async (input: {
      ticketId: string;
      runId?: string;
      kind: LiveEvent["kind"];
      status: LiveEvent["status"];
      title: string;
      detail?: string;
      agent?: string;
      tool?: string;
      repo?: string;
      payload?: unknown;
    }) => {
      const delivery = await record(input.ticketId, {
        kind: input.kind,
        status: input.status,
        title: input.title,
        detail: input.detail ?? null,
        agent: input.agent ?? null,
        tool: input.tool ?? null,
        repo: input.repo ?? null,
        payload: input.payload ?? null,
        runId: input.runId,
      });
      return delivery;
    },
  }),
];

// ------------------------------------------------------------- interne ----

interface EventDraft {
  kind: LiveEvent["kind"];
  status: LiveEvent["status"];
  title: string;
  detail?: string | null;
  agent?: string | null;
  tool?: string | null;
  repo?: string | null;
  payload?: unknown;
  runId?: string;
}

/**
 * Sur disque d'abord, diffuse ensuite. C'est cet ordre qui fait que le live
 * shell n'est pas un point de defaillance : s'il est mort, l'historique reste
 * complet et une reprise peut le rejouer depuis le debut.
 */
async function record(ticketId: string, draft: EventDraft): Promise<{ seq: number; persisted: boolean; delivery: string }> {
  const session = readLiveSession(ticketId);
  const candidate = {
    runId: draft.runId ?? session?.runId ?? `local-${ticketId}`,
    ticketId,
    seq: nextSeq(ticketId),
    ts: new Date().toISOString(),
    kind: draft.kind,
    status: draft.status,
    repo: draft.repo ?? null,
    agent: draft.agent ?? null,
    tool: draft.tool ?? null,
    title: draft.title,
    detail: draft.detail ?? null,
    payload: draft.payload ?? null,
  };

  const validated = validateEvent(candidate);
  if (!validated.ok) {
    fail(`Event invalide : ${validated.issues.join(" ; ")}.`, "Un event mal forme est ignore par l'interface, autant le corriger ici.");
  }

  appendEvent(validated.event);
  const delivery = await broadcast(validated.event);
  return { seq: validated.event.seq, persisted: true, delivery };
}

async function finishQuestion(
  ticketId: string,
  agent: string | null,
  answers: Record<string, string>,
  transport: string,
): Promise<void> {
  // Un lot repondu compte pour une intervention, pas pour trois : c'est un seul
  // arret du workflow et un seul aller-retour humain.
  patchTicketState(ticketId, { metrics: { humanInterventions: { __increment: 1 } } });
  const summary = Object.entries(answers)
    .map(([key, value]) => `${key} = ${value}`)
    .join(" · ");
  await record(ticketId, {
    kind: "answer",
    status: "ok",
    agent,
    title: `Reponses recues (${transport}) : ${truncate(summary, 140)}`,
    detail: Object.entries(answers)
      .map(([key, value]) => `${key}\n  ${value}`)
      .join("\n\n"),
    payload: { transport, answers },
  });
}

async function askLiveShell(
  url: string,
  input: { questions: { key: string; header: string; question: string; options: string[] }[]; askedBy: string | null },
  timeoutMs: number,
): Promise<Record<string, string> | null> {
  try {
    const response = await fetch(`${url}/rpc/ask`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!response.ok) return null;
    const data = (await response.json()) as { answers?: Record<string, string> };
    return data.answers && typeof data.answers === "object" ? data.answers : null;
  } catch {
    return null;
  }
}

function formatQuestions(questions: { header: string; question: string; options: string[] }[]): string {
  return questions
    .map((entry) => {
      const options = entry.options.length > 0 ? `\n${entry.options.map((option) => `- ${option}`).join("\n")}` : "";
      return `${entry.header}\n${entry.question}${options}`;
    })
    .join("\n\n");
}

async function isAlive(url: string): Promise<boolean> {
  try {
    const response = await fetch(`${url}/rpc/health`, { signal: AbortSignal.timeout(1500) });
    return response.ok;
  } catch {
    return false;
  }
}

async function waitFor(url: string, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await isAlive(url)) return true;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  return false;
}

async function findFreePort(from: number, to: number): Promise<number> {
  const span = to - from;
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const port = from + Math.floor(Math.random() * span);
    if (await isFree(port)) return port;
  }
  fail(`Aucun port libre entre ${from} et ${to}.`);
}

function isFree(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = createServer();
    server.once("error", () => resolve(false));
    server.once("listening", () => server.close(() => resolve(true)));
    server.listen(port, "127.0.0.1");
  });
}

function truncate(text: string, max: number): string {
  const single = text.replace(/\s+/g, " ").trim();
  return single.length <= max ? single : `${single.slice(0, max - 1)}…`;
}
