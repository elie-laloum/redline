import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { appendEvent, closeEventLogs, nextSeq, readEvents, resetSeqCache } from "../../plugins/autopilot/mcp/lib/events.ts";
import type { ToolContext } from "../../plugins/autopilot/mcp/lib/tool.ts";
import { toolByName } from "../../plugins/autopilot/mcp/registry.ts";
import { sandboxHome } from "../helpers.ts";

const sandbox = sandboxHome();
after(() => {
  closeEventLogs();
  resetSeqCache();
  sandbox.cleanup();
});
before(() => resetSeqCache());

const askUser = toolByName("ask-user");

/** Aucun canal direct : le tool doit rendre les questions a l'appelant. */
const NO_CHANNEL: ToolContext = {
  canAskHuman: false,
  heartbeat: () => {},
  askHuman: async () => ({ action: "cancel", content: null }),
};

function call(input: Record<string, unknown>) {
  assert.ok(askUser, "le tool ask-user existe");
  return askUser.handler(input, NO_CHANNEL) as Promise<any>;
}

describe("ask-user pose un lot", () => {
  it("rend toutes les questions d'un coup quand aucun canal n'est disponible", async () => {
    const result = await call({
      ticketId: "TJ-500",
      askedBy: "functional-grill",
      questions: [
        { key: "tirage", header: "Tirage", question: "Comment la variante est-elle tiree ?", options: ["hasard", "par utilisateur", "par dossier"] },
        { key: "mesure", header: "Mesure", question: "Qu'est-ce qu'on mesure ?", options: ["temps", "clics", "rien"] },
      ],
    });

    assert.equal(result.transport, "caller");
    assert.equal(result.questions.length, 2);
    assert.deepEqual(result.questions.map((entry: any) => entry.key), ["tirage", "mesure"]);
    // Trois questions posees separement, c'est trois arrets du workflow.
    assert.match(result.note, /ces questions/);
  });

  it("refuse un lot vide", async () => {
    await assert.rejects(() => call({ ticketId: "TJ-501", questions: [] }), /vide/);
  });

  it("refuse une question a option unique : ce n'est pas un choix", async () => {
    await assert.rejects(
      () =>
        call({
          ticketId: "TJ-502",
          questions: [{ key: "k", header: "H", question: "Une seule issue ?", options: ["oui"] }],
        }),
      (error: unknown) => {
        const failure = error as { message: string; hint: string | null };
        assert.match(failure.message, /Une seule option proposee sur : k/);
        // L'indice dit quoi faire, pas seulement ce qui ne va pas.
        assert.match(failure.hint ?? "", /trois ou quatre, ou aucune/);
        return true;
      },
    );
  });

  it("accepte une question sans option : le champ libre suffit", async () => {
    const result = await call({
      ticketId: "TJ-503",
      questions: [{ key: "libre", header: "Libre", question: "Qu'est-ce qui manque au ticket ?" }],
    });
    assert.equal(result.questions[0].options.length, 0);
  });

  it("laisse une trace de la question dans le flux d'events", async () => {
    await call({
      ticketId: "TJ-504",
      askedBy: "technical-grill",
      questions: [
        { key: "a", header: "Index", question: "Faut-il un index sur la colonne de date ?", options: ["oui", "non", "a mesurer"] },
        { key: "b", header: "Volume", question: "Quel volume attendu ?", options: ["moins de 1k", "1k a 100k", "plus"] },
      ],
    });

    const question = readEvents("TJ-504").find((event) => event.kind === "question");
    assert.ok(question, "un event question a ete pousse");
    assert.equal(question.status, "waiting");
    assert.equal(question.agent, "technical-grill");
    // Le titre doit se lire seul dans l'interface.
    assert.match(question.title, /2 questions : Index, Volume/);
  });
});

describe("le compteur de sequence", () => {
  it("reste monotone sans relire le fichier a chaque event", () => {
    resetSeqCache();
    const seqs = Array.from({ length: 50 }, () => {
      const seq = nextSeq("TJ-600");
      appendEvent({
        runId: "r", ticketId: "TJ-600", seq, ts: new Date().toISOString(),
        kind: "tool", status: "ok", repo: null, agent: null, tool: "t", step: null,
        title: "un event de test lisible seul", detail: null, payload: null,
      });
      return seq;
    });

    assert.deepEqual(seqs, Array.from({ length: 50 }, (_, index) => index));
    assert.equal(readEvents("TJ-600").length, 50);
  });

  it("reprend au bon numero apres un redemarrage de process", () => {
    // Le cache tombe, le fichier reste : c'est la situation d'une reprise.
    closeEventLogs();
    resetSeqCache();
    assert.equal(nextSeq("TJ-600"), 50);
  });

  it("compte separement chaque ticket", () => {
    resetSeqCache();
    assert.equal(nextSeq("TJ-601"), 0);
    assert.equal(nextSeq("TJ-602"), 0);
    assert.equal(nextSeq("TJ-601"), 1);
  });
});

/**
 * Le lot se depose, il ne se tient pas.
 *
 * Cette suite existe a cause d'une panne precise et repetee : `/rpc/ask`
 * gardait la requete ouverte jusqu'a la reponse humaine, et le client HTTP de
 * Node abandonne une requete dont les en-tetes n'arrivent pas au bout de 300
 * secondes (`UND_ERR_HEADERS_TIMEOUT`). Le lot repartait donc au terminal au
 * bout de cinq minutes, alors que le serveur MCP annonce huit heures — mesure
 * faite, la coupure tombait a 301,0 s.
 *
 * On ne peut pas tester huit heures. On teste la propriete qui les rend
 * possibles : **aucun appel n'est tenu ouvert**. Si quelqu'un remet un
 * long-poll, le depot cesse de rendre la main tout de suite et ces tests
 * tombent — avant que le prochain cadrage ne le decouvre a ses depens.
 */
describe("le lot se depose et se releve, sans requete tenue ouverte", () => {
  let shell: import("node:http").Server;
  let base = "";

  before(async () => {
    const { createServer } = await import("node:http");
    const slots = new Map<string, { answers: Record<string, string> | null }>();

    shell = createServer((request, response) => {
      const url = new URL(request.url ?? "/", "http://localhost");
      const send = (code: number, body: unknown) => {
        response.writeHead(code, { "content-type": "application/json" });
        response.end(JSON.stringify(body));
      };

      if (url.pathname === "/rpc/health") return send(200, { ok: true });

      if (url.pathname === "/rpc/collect") {
        const id = url.searchParams.get("id") ?? "";
        const slot = slots.get(id);
        if (!slot) return send(200, { status: "gone" });
        if (!slot.answers) return send(200, { status: "pending" });
        slots.delete(id);
        return send(200, { status: "answered", answers: slot.answers });
      }

      let raw = "";
      request.on("data", (chunk) => {
        raw += chunk;
      });
      request.on("end", () => {
        const body = JSON.parse(raw || "{}") as { id?: string };
        if (url.pathname === "/rpc/ask") {
          slots.set(String(body.id), { answers: null });
          // La reponse arrive « plus tard », comme un humain qui lit.
          setTimeout(() => slots.set(String(body.id), { answers: { tirage: "par dossier" } }), 120);
          return send(200, { id: body.id, status: "pending" });
        }
        return send(404, { error: "route inconnue" });
      });
    });

    await new Promise<void>((resolve) => shell.listen(0, "127.0.0.1", resolve));
    const address = shell.address();
    base = typeof address === "object" && address ? `http://127.0.0.1:${address.port}` : "";
  });

  after(() => shell.close());

  it("depose le lot en une requete qui rend la main tout de suite", async () => {
    const started = Date.now();
    const response = await fetch(`${base}/rpc/ask`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: "lot-1", questions: [] }),
    });
    const elapsed = Date.now() - started;

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { id: "lot-1", status: "pending" });
    // Genereux : ce qui est teste est « ne tient pas la reponse », pas la
    // vitesse de la boucle locale. Un long-poll mettrait ici 120 ms au mieux,
    // et 300 000 ms en vrai.
    assert.ok(elapsed < 100, `le depot a pris ${elapsed} ms : la requete est tenue ouverte`);
  });

  it("rend `pending` tant que personne n'a repondu, sans attendre", async () => {
    await fetch(`${base}/rpc/ask`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: "lot-2", questions: [] }),
    });

    const started = Date.now();
    const slot = (await (await fetch(`${base}/rpc/collect?id=lot-2`)).json()) as { status: string };
    const elapsed = Date.now() - started;

    assert.equal(slot.status, "pending");
    assert.ok(elapsed < 100, `la releve a pris ${elapsed} ms : elle attend au lieu de rendre l'etat`);
  });

  it("rend la reponse a la releve suivante, une seule fois", async () => {
    await fetch(`${base}/rpc/ask`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: "lot-3", questions: [] }),
    });
    await new Promise((resolve) => setTimeout(resolve, 200));

    const first = (await (await fetch(`${base}/rpc/collect?id=lot-3`)).json()) as {
      status: string;
      answers?: Record<string, string>;
    };
    assert.equal(first.status, "answered");
    assert.deepEqual(first.answers, { tirage: "par dossier" });

    // Relevee, la reponse ne se rend pas deux fois : deux releves concurrentes
    // feraient repartir le run deux fois sur le meme arbitrage.
    const second = (await (await fetch(`${base}/rpc/collect?id=lot-3`)).json()) as { status: string };
    assert.notEqual(second.status, "answered");
  });

  it("dit `gone` pour un lot qu'il ne connait pas, pour qu'il soit redepose", async () => {
    const slot = (await (await fetch(`${base}/rpc/collect?id=jamais-vu`)).json()) as { status: string };
    // C'est le cas du shell redemarre en pleine attente. Sans ce signal,
    // l'appelant attendrait une reponse que plus personne ne peut donner.
    assert.equal(slot.status, "gone");
  });
});
