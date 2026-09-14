import type { ReactNode } from "react";
import { useState } from "react";
import { cn } from "#/lib/utils";

/**
 * Les quelques primitives dont l'interface a besoin, au style Shadcn.
 * Pas d'ui surchargee : tout ce qui compte doit etre lisible d'un coup d'oeil,
 * le reste est accessible mais replie.
 */

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <section className={cn("rounded-lg border bg-card text-card-foreground shadow-xs", className)}>{children}</section>
  );
}

export function CardHeader({ title, aside }: { title: ReactNode; aside?: ReactNode }) {
  return (
    <header className="flex items-center justify-between gap-3 border-b px-4 py-2.5">
      <h2 className="text-sm font-medium tracking-tight">{title}</h2>
      {aside ? <div className="flex items-center gap-2 text-xs text-muted-foreground">{aside}</div> : null}
    </header>
  );
}

export function CardBody({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("px-4 py-3", className)}>{children}</div>;
}

export type Tone = "neutral" | "ok" | "ko" | "waiting" | "active";

const TONES: Record<Tone, string> = {
  neutral: "border-border bg-muted text-muted-foreground",
  ok: "border-transparent bg-ok/12 text-ok",
  ko: "border-transparent bg-ko/12 text-ko",
  waiting: "border-transparent bg-waiting/15 text-waiting",
  active: "border-transparent bg-primary text-primary-foreground",
};

export function Badge({ children, tone = "neutral" }: { children: ReactNode; tone?: Tone }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px] font-medium leading-none",
        TONES[tone],
      )}
    >
      {children}
    </span>
  );
}

export function Button({
  children,
  onClick,
  type = "button",
  variant = "default",
}: {
  children: ReactNode;
  onClick?: () => void;
  type?: "button" | "submit";
  variant?: "default" | "ghost";
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      className={cn(
        "inline-flex h-8 items-center justify-center rounded-md px-3 text-sm font-medium transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        variant === "default"
          ? "bg-primary text-primary-foreground hover:opacity-90"
          : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
      )}
    >
      {children}
    </button>
  );
}

/** Replie par defaut : les messages bruts, les details, les checklists. */
export function Accordion({
  title,
  count,
  children,
  defaultOpen = false,
}: {
  title: string;
  count?: number;
  children: ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-b last:border-b-0">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center justify-between gap-2 px-4 py-2.5 text-left text-sm hover:bg-accent/50"
      >
        <span className="flex items-center gap-2">
          <span className={cn("text-muted-foreground transition-transform", open && "rotate-90")}>›</span>
          {title}
        </span>
        {count === undefined ? null : <Badge>{count}</Badge>}
      </button>
      {open ? <div className="px-4 pb-3 text-sm">{children}</div> : null}
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="py-1 text-sm text-muted-foreground">{children}</p>;
}
