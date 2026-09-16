import { createStartHandler, defaultStreamHandler } from "@tanstack/react-start/server";
import {
  answer,
  ask,
  askPlan,
  decide,
  ingest,
  replay,
  snapshot,
  subscribe,
  withdraw,
} from "./lib/live-store.ts";

/**
 * Entree serveur du live shell.
 *
 * Trois canaux, tous locaux :
 *
 * | Sens                       | Canal                         |
 * |----------------------------|-------------------------------|
 * | session Claude -> app      | rpc POST /rpc/event           |
 * | app -> navigateur          | SSE /rpc/stream               |
 * | app -> session Claude      | reponse de POST /rpc/ask      |
 *
 * Tout le reste part au rendu SSR du routeur.
 */

const ssr = createStartHandler(defaultStreamHandler);

export default {
  async fetch(request: Request, ...rest: unknown[]): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname.startsWith("/rpc/")) {
      return rpc(url.pathname, request);
    }

    // @ts-expect-error — la signature exacte du handler varie avec l'adaptateur.
    return ssr(request, ...rest);
  },
};

async function rpc(pathname: string, request: Request): Promise<Response> {
  switch (pathname) {
    case "/rpc/health":
      return json({ ok: true, at: new Date().toISOString() });

    case "/rpc/state": {
      replay();
      return json(snapshot());
    }

    case "/rpc/event": {
      if (request.method !== "POST") return json({ error: "POST attendu" }, 405);
      const body = await safeJson(request);
      const result = ingest(body);
      return json(result, result.accepted ? 200 : 202);
    }

    case "/rpc/ask": {
      if (request.method !== "POST") return json({ error: "POST attendu" }, 405);
      const body = (await safeJson(request)) as {
        id?: string | null;
        questions?: {
          key?: string;
          header?: string;
          question?: string;
          options?: string[];
        }[];
        askedBy?: string | null;
      } | null;

      const questions = (body?.questions ?? [])
        .filter((entry) => typeof entry?.question === "string" && entry.question.trim())
        .map((entry, index) => ({
          key: entry.key?.trim() || `q${index + 1}`,
          header: entry.header?.trim() || `Question ${index + 1}`,
          question: String(entry.question).trim(),
          options: (entry.options ?? []).map(String).filter(Boolean),
        }));

      if (questions.length === 0) return json({ error: "`questions` vide" }, 400);

      // On bloque ici, volontairement, jusqu'a ce que le lot entier soit
      // repondu dans l'interface. Le timeout est cote appelant : c'est lui qui
      // sait a partir de quand il doit se rabattre sur le terminal.
      const answers = await ask({
        questions,
        askedBy: body?.askedBy ?? null,
        id: body?.id ?? null,
      });
      // `null` veut dire que l'appelant a retire le lot : il a repris la main
      // ailleurs, et la page a deja ete prevenue.
      if (answers === null) return json({ withdrawn: true }, 409);
      return json({ answers });
    }

    case "/rpc/ask-plan": {
      if (request.method !== "POST") return json({ error: "POST attendu" }, 405);
      const body = (await safeJson(request)) as {
        id?: string | null;
        repos?: { repo?: string; level?: number; changes?: string[]; why?: string }[];
        note?: string | null;
        askedBy?: string | null;
      } | null;

      const repos = (body?.repos ?? [])
        .filter((entry) => typeof entry?.repo === "string" && entry.repo.trim())
        .map((entry) => ({
          repo: String(entry.repo).trim(),
          level: typeof entry.level === "number" ? entry.level : null,
          changes: (entry.changes ?? []).map(String).filter(Boolean),
          why: entry.why?.trim() || null,
        }));

      if (repos.length === 0) return json({ error: "`repos` vide" }, 400);

      // Meme blocage que `/rpc/ask`, et pour la meme raison : le point 9 est un
      // arret du workflow, pas une notification.
      const decision = await askPlan({
        repos,
        note: body?.note?.trim() || null,
        askedBy: body?.askedBy ?? null,
        id: body?.id ?? null,
      });
      if (decision === null) return json({ withdrawn: true }, 409);
      return json({ decision });
    }

    case "/rpc/decide": {
      if (request.method !== "POST") return json({ error: "POST attendu" }, 405);
      const body = (await safeJson(request)) as { id?: string; verdict?: string; note?: string } | null;
      const verdict = body?.verdict;
      if (!body?.id || (verdict !== "approve" && verdict !== "amend" && verdict !== "reject")) {
        return json({ error: "`id` et `verdict` requis" }, 400);
      }
      const result = decide(body.id, { verdict, note: String(body.note ?? "") });
      return json(result, result.delivered ? 200 : 409);
    }

    case "/rpc/withdraw": {
      if (request.method !== "POST") return json({ error: "POST attendu" }, 405);
      const body = (await safeJson(request)) as { id?: string } | null;
      if (!body?.id) return json({ error: "`id` requis" }, 400);
      return json(withdraw(body.id));
    }

    case "/rpc/answer": {
      if (request.method !== "POST") return json({ error: "POST attendu" }, 405);
      const body = (await safeJson(request)) as {
        id?: string;
        answers?: Record<string, string>;
      } | null;
      if (!body?.id || typeof body.answers !== "object" || body.answers === null) {
        return json({ error: "`id` et `answers` requis" }, 400);
      }
      const result = answer(body.id, body.answers as Record<string, string>);
      return json(result, result.delivered ? 200 : 409);
    }

    case "/rpc/stream":
      return stream();

    default:
      return json({ error: `Route rpc inconnue : ${pathname}` }, 404);
  }
}

/**
 * SSE vers le navigateur. La reconnexion est automatique cote `EventSource` ;
 * a chaque reconnexion le client redemande `/rpc/state`, ce qui lui rend
 * l'historique complet et evite les trous.
 */
function stream(): Response {
  const encoder = new TextEncoder();
  let unsubscribe: (() => void) | null = null;
  let heartbeat: ReturnType<typeof setInterval> | null = null;

  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (payload: string) => controller.enqueue(encoder.encode(payload));
      send(`retry: 2000\n\n`);
      send(`event: snapshot\ndata: ${JSON.stringify(snapshot())}\n\n`);
      unsubscribe = subscribe(send);
      heartbeat = setInterval(() => {
        try {
          send(`: ping\n\n`);
        } catch {
          /* le flux est ferme, cancel s'en occupe */
        }
      }, 20_000);
    },
    cancel() {
      unsubscribe?.();
      if (heartbeat) clearInterval(heartbeat);
    },
  });

  return new Response(body, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
    },
  });
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

async function safeJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return null;
  }
}
