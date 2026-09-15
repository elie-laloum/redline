import { createStartHandler, defaultStreamHandler } from "@tanstack/react-start/server";
import { answer, ask, ingest, replay, snapshot, subscribe } from "./lib/live-store.ts";

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
        questions?: { key?: string; header?: string; question?: string; options?: string[] }[];
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
      const answers = await ask({ questions, askedBy: body?.askedBy ?? null });
      return json({ answers });
    }

    case "/rpc/answer": {
      if (request.method !== "POST") return json({ error: "POST attendu" }, 405);
      const body = (await safeJson(request)) as { id?: string; answers?: Record<string, string> } | null;
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
