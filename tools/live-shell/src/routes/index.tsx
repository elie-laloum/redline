import { createFileRoute } from "@tanstack/react-router";
import { ActionBar } from "#/components/action-bar";
import { QuestionPanel } from "#/components/question-panel";
import { Accordion, Badge, Card, CardBody, CardHeader, Empty, type Tone } from "#/components/ui";
import { STEPS } from "#/lib/event";
import { getSnapshot } from "#/lib/snapshot-fn";
import { type ScopeEntry, useLiveRun } from "#/lib/use-live-run";
import { cn } from "#/lib/utils";

export const Route = createFileRoute("/")({
  // Rendu serveur de l'etat complet : la premiere frame montre deja le run.
  loader: () => getSnapshot(),
  component: LiveShell,
});

function LiveShell() {
  const run = useLiveRun(Route.useLoaderData());
  const ticket = run.ticket?.ticket;

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-5xl flex-col gap-4 p-4 sm:p-6">
      <ActionBar
        current={run.current}
        busy={run.busy}
        step={run.currentStep}
        repo={run.currentRepo}
        connection={run.connection}
      />

      <Header
        ticketKey={ticket?.key ?? run.ticketId ?? "—"}
        title={ticket?.title ?? null}
        status={ticket?.statusAtStart ?? null}
        url={ticket?.url ?? null}
        connected={run.connected}
      />

      {run.escalation ? <EscalationBanner escalation={run.escalation} /> : null}
      {run.question ? <QuestionPanel question={run.question} onAnswer={run.answer} /> : null}

      <Scope repos={run.ticket?.scope ?? []} current={run.currentRepo} />
      <Loop stepIndex={run.stepIndex} currentStep={run.currentStep} />

      <div className="grid gap-4 md:grid-cols-2">
        <CurrentStep
          step={run.currentStep}
          repo={run.currentRepo}
          agent={run.currentAgent}
          tool={run.currentTool}
          loops={run.loops}
        />
        <Todos todos={run.todos} />
      </div>

      <Card>
        <Accordion title="Checklists des adversaires" count={run.checklists.length}>
          {run.checklists.length === 0 ? (
            <Empty>Aucune checklist rendue pour l'instant.</Empty>
          ) : (
            <div className="flex flex-col gap-3">
              {run.checklists.map((checklist) => (
                <div key={`${checklist.agent}-${checklist.at}`}>
                  <p className="mb-1 text-xs text-muted-foreground">
                    {checklist.agent} · {time(checklist.at)}
                  </p>
                  <ul className="flex flex-col gap-1">
                    {checklist.lines.map((line) => (
                      <li key={line} className="font-mono text-xs leading-relaxed">
                        {line}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </Accordion>

        <Accordion title="Messages de la conversation" count={run.messages.length}>
          {run.messages.length === 0 ? (
            <Empty>Rien pour l'instant.</Empty>
          ) : (
            <ul className="flex flex-col gap-2">
              {run.messages.map((message) => (
                <li key={`${message.runId}-${message.seq}`}>
                  <p className="text-sm">{message.title}</p>
                  {message.detail ? (
                    <p className="mt-0.5 whitespace-pre-wrap text-xs text-muted-foreground">{message.detail}</p>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </Accordion>

        <Accordion title="Flux complet" count={run.events.length}>
          <ul className="flex flex-col gap-1">
            {[...run.events].reverse().map((event) => (
              <EventRow key={`${event.runId}-${event.seq}`} event={event} />
            ))}
          </ul>
        </Accordion>

        {run.ignored.length > 0 ? (
          <Accordion title="Events ignores" count={run.ignored.length}>
            <ul className="flex flex-col gap-1 text-xs text-muted-foreground">
              {run.ignored.map((entry) => (
                <li key={`${entry.at}-${entry.reason}`}>
                  {time(entry.at)} — {entry.reason}
                </li>
              ))}
            </ul>
          </Accordion>
        ) : null}
      </Card>

      <Metrics metrics={run.ticket?.metrics ?? {}} />
    </div>
  );
}

function Header({
  ticketKey,
  title,
  status,
  url,
  connected,
}: {
  ticketKey: string;
  title: string | null;
  status: string | null;
  url: string | null;
  connected: boolean;
}) {
  return (
    <header className="flex flex-wrap items-baseline justify-between gap-2">
      <div className="flex flex-wrap items-baseline gap-2">
        <h1 className="text-lg font-semibold tracking-tight">
          {url ? (
            <a href={url} className="hover:underline">
              {ticketKey}
            </a>
          ) : (
            ticketKey
          )}
        </h1>
        <p className="text-sm text-muted-foreground">{title ?? "en attente du ticket"}</p>
      </div>
      <div className="flex items-center gap-2">
        {status ? <Badge>{status}</Badge> : null}
        <Badge tone={connected ? "ok" : "ko"}>{connected ? "en direct" : "deconnecte"}</Badge>
      </div>
    </header>
  );
}

/** Une escalade doit bloquer visuellement : on comprend pourquoi sans cliquer. */
function EscalationBanner({ escalation }: { escalation: { step: string; repo: string | null; reason: string; at: string } }) {
  return (
    <Card className="border-ko/40 bg-ko/5">
      <CardBody>
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone="ko">escalade</Badge>
          <span className="text-sm font-medium">point {escalation.step}</span>
          {escalation.repo ? <Badge>{escalation.repo}</Badge> : null}
          <span className="text-xs text-muted-foreground">{time(escalation.at)}</span>
        </div>
        <p className="mt-2 text-sm">{escalation.reason}</p>
        <p className="mt-2 text-xs text-muted-foreground">
          Rien n'a ete publie : ni MR, ni canal, ni transition. Relancer <code>/autopilot-start</code> reprend ici.
        </p>
      </CardBody>
    </Card>
  );
}

const SCOPE_TONES: Record<ScopeEntry["status"], Tone> = {
  pending: "neutral",
  "in-progress": "active",
  done: "ok",
  escalated: "ko",
};

function Scope({ repos, current }: { repos: ScopeEntry[]; current: string | null }) {
  return (
    <Card>
      <CardHeader title="Perimetre" aside={<span>amont vers aval</span>} />
      <CardBody className="flex flex-wrap gap-2">
        {repos.length === 0 ? (
          <Empty>Le perimetre n'est pas encore etabli.</Empty>
        ) : (
          repos.map((repo) => (
            <span
              key={repo.name}
              className={cn(
                "inline-flex items-center gap-2 rounded-md border px-2 py-1 text-xs",
                repo.name === current && "ring-2 ring-ring",
              )}
            >
              <span className="text-muted-foreground">L{repo.level}</span>
              <span className="font-medium">{repo.name}</span>
              <Badge tone={SCOPE_TONES[repo.status] ?? "neutral"}>{repo.status}</Badge>
            </span>
          ))
        )}
      </CardBody>
    </Card>
  );
}

function Loop({ stepIndex, currentStep }: { stepIndex: number; currentStep: string }) {
  return (
    <Card>
      <CardHeader title="La boucle" aside={<span>etape {currentStep}</span>} />
      <CardBody className="flex flex-wrap gap-1.5">
        {STEPS.map((step, index) => {
          const done = stepIndex >= 0 && index < stepIndex;
          const active = index === stepIndex;
          return (
            <span
              key={step.id}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs",
                done && "text-muted-foreground",
                active && "border-transparent bg-primary font-medium text-primary-foreground",
              )}
            >
              <span className="tabular-nums">{done ? "✓" : step.id}</span>
              {step.label}
            </span>
          );
        })}
      </CardBody>
    </Card>
  );
}

function CurrentStep({
  step,
  repo,
  agent,
  tool,
  loops,
}: {
  step: string;
  repo: string | null;
  agent: string | null;
  tool: string | null;
  loops: { name: string; count: number; budget: number | null }[];
}) {
  return (
    <Card>
      <CardHeader title={`Etape ${step}`} aside={repo ? <Badge>{repo}</Badge> : null} />
      <CardBody className="flex flex-col gap-2 text-sm">
        <Line label="agent" value={agent} />
        <Line label="tool" value={tool} />
        {loops.length > 0 ? (
          <div className="mt-1 flex flex-wrap gap-1.5">
            {loops.map((loop) => (
              <Badge key={loop.name} tone={loop.budget && loop.count >= loop.budget ? "ko" : "neutral"}>
                {loop.name} {loop.count}
                {loop.budget ? `/${loop.budget}` : ""}
              </Badge>
            ))}
          </div>
        ) : null}
      </CardBody>
    </Card>
  );
}

function Todos({ todos }: { todos: { text: string; status: string }[] }) {
  return (
    <Card>
      <CardHeader title="Todo du developer" aside={<span>{todos.length}</span>} />
      <CardBody>
        {todos.length === 0 ? (
          <Empty>Aucune todo en cours.</Empty>
        ) : (
          <ul className="flex flex-col gap-1 text-sm">
            {todos.map((todo) => (
              <li key={todo.text} className="flex items-start gap-2">
                <span className="mt-0.5 text-muted-foreground">
                  {todo.status === "completed" ? "✓" : todo.status === "in_progress" ? "›" : "·"}
                </span>
                <span className={cn(todo.status === "completed" && "text-muted-foreground line-through")}>
                  {todo.text}
                </span>
              </li>
            ))}
          </ul>
        )}
      </CardBody>
    </Card>
  );
}

function Metrics({ metrics }: { metrics: { humanInterventions?: number; loopTurnsTotal?: number; mrFeedbackCount?: number | null } }) {
  return (
    <p className="text-xs text-muted-foreground">
      retours sur MR {metrics.mrFeedbackCount ?? "—"} · interventions humaines {metrics.humanInterventions ?? 0} · tours
      de boucle {metrics.loopTurnsTotal ?? 0}
    </p>
  );
}

const STATUS_TONES: Record<string, Tone> = { ok: "ok", ko: "ko", waiting: "waiting", start: "active", progress: "neutral" };

function EventRow({ event }: { event: { seq: number; ts: string; status: string; title: string; detail: string | null; agent: string | null } }) {
  return (
    <li className="flex items-start gap-2 text-xs">
      <span className="tabular-nums text-muted-foreground">{time(event.ts)}</span>
      <Badge tone={STATUS_TONES[event.status] ?? "neutral"}>{event.status}</Badge>
      <span className="flex-1">
        {event.title}
        {event.detail ? <span className="block text-muted-foreground">{event.detail}</span> : null}
      </span>
      {event.agent ? <span className="text-muted-foreground">{event.agent}</span> : null}
    </li>
  );
}

function Line({ label, value }: { label: string; value: string | null }) {
  return (
    <p className="flex items-baseline gap-2">
      <span className="w-12 shrink-0 text-xs text-muted-foreground">{label}</span>
      <span className={cn("font-mono text-xs", !value && "text-muted-foreground")}>{value ?? "—"}</span>
    </p>
  );
}

function time(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  } catch {
    return iso;
  }
}
