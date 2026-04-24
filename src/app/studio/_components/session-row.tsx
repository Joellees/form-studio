"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import {
  approveSessionRequest,
  cancelSession,
  updateSessionType,
} from "@/app/studio/calendar/actions";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export type SessionSummary = {
  id: string;
  scheduled_at: string;
  duration_minutes: number;
  session_type: "in_person" | "zoom" | "in_app";
  status: "scheduled" | "completed" | "cancelled" | "requested" | "declined";
  name: string | null;
  client_name?: string | null;
  formatted_time: string;
};

/**
 * Inline session card. Used in the calendar week-grid (variant=card,
 * vertical layout) and on the client-detail page (variant=list,
 * horizontal). Trainer can change session type inline and take the
 * common actions (cancel, approve, approve as in-app) from a ⋯ menu.
 */
export function SessionRow({
  session,
  variant = "list",
}: {
  session: SessionSummary;
  variant?: "list" | "card";
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [menuOpen, setMenuOpen] = useState(false);

  function runAction<T>(fn: () => Promise<T>) {
    startTransition(async () => {
      await fn();
      router.refresh();
    });
  }

  const isRequested = session.status === "requested";
  const isCancelled = session.status === "cancelled";

  const TypeSelect = (
    <select
      aria-label="session type"
      value={session.session_type}
      disabled={pending || isCancelled}
      onChange={(e) =>
        runAction(() =>
          updateSessionType({
            sessionId: session.id,
            sessionType: e.target.value as SessionSummary["session_type"],
          }),
        )
      }
      className={cn(
        "appearance-none cursor-pointer rounded-full bg-[color:var(--color-parchment)] font-semibold uppercase tracking-[0.08em] text-[color:var(--color-ink)] transition-colors hover:bg-[color:var(--color-stone-soft)] focus-visible:outline-none",
        variant === "card"
          ? "py-[3px] pl-2.5 pr-6 text-[10px]"
          : "py-1 pl-3 pr-7 text-[11px]",
      )}
      style={{
        backgroundImage:
          "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'><path fill='none' stroke='%231F1E1B' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round' d='M4 6.5l4 4 4-4'/></svg>\")",
        backgroundPosition: variant === "card" ? "right 6px center" : "right 8px center",
        backgroundSize: variant === "card" ? "9px" : "10px",
        backgroundRepeat: "no-repeat",
      }}
    >
      <option value="in_person">in person</option>
      <option value="zoom">zoom</option>
      <option value="in_app">in app</option>
    </select>
  );

  const MenuBtn = (
    <button
      type="button"
      aria-label="session actions"
      onClick={(e) => {
        e.stopPropagation();
        setMenuOpen((v) => !v);
      }}
      className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[color:var(--color-stone)] transition-colors hover:bg-[color:var(--color-ink)]/5 hover:text-[color:var(--color-ink)]"
    >
      ⋯
    </button>
  );

  const Menu = menuOpen ? (
    <>
      <div className="fixed inset-0 z-30" onClick={() => setMenuOpen(false)} aria-hidden />
      <div className="absolute right-0 top-full z-40 mt-1 flex w-48 flex-col gap-0.5 rounded-2xl bg-[color:var(--color-canvas)] p-1.5 shadow-[0_8px_24px_-6px_rgba(31,30,27,0.25),0_0_0_1px_rgba(31,30,27,0.08)]">
        {isRequested ? (
          <>
            <MenuItem
              onClick={() => {
                setMenuOpen(false);
                runAction(() => approveSessionRequest(session.id));
              }}
            >
              approve
            </MenuItem>
            <MenuItem
              onClick={() => {
                setMenuOpen(false);
                runAction(async () => {
                  await updateSessionType({ sessionId: session.id, sessionType: "in_app" });
                  await approveSessionRequest(session.id);
                });
              }}
            >
              approve as in-app
            </MenuItem>
          </>
        ) : null}

        <MenuItem asChild>
          <Link href={`/studio/sessions/${session.id}`} onClick={() => setMenuOpen(false)}>
            open details
          </Link>
        </MenuItem>

        {!isCancelled ? (
          <MenuItem
            danger
            onClick={() => {
              setMenuOpen(false);
              if (!confirm("Cancel this session?")) return;
              runAction(() => cancelSession({ sessionId: session.id, actor: "trainer" }));
            }}
          >
            cancel session
          </MenuItem>
        ) : null}
      </div>
    </>
  ) : null;

  if (variant === "card") {
    return (
      <div
        className={cn(
          "group relative flex flex-col gap-2 rounded-xl bg-[color:var(--color-canvas)] p-2.5",
          pending && "opacity-70",
        )}
      >
        <div className="flex items-start justify-between gap-1">
          <Link
            href={`/studio/sessions/${session.id}`}
            className="min-w-0 flex-1"
          >
            <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[color:var(--color-stone)] tabular-nums">
              {session.formatted_time}
            </p>
            <p className="truncate text-xs font-semibold text-[color:var(--color-ink)] hover:text-[color:var(--color-moss-deep)]">
              {session.client_name ?? session.name ?? "Session"}
            </p>
          </Link>
          {MenuBtn}
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {TypeSelect}
          {isRequested ? <Badge tone="signal">request</Badge> : null}
        </div>
        {Menu}
      </div>
    );
  }

  return (
    <div
      className={cn(
        "group relative flex items-center gap-3 px-0 py-2.5",
        pending && "opacity-70",
      )}
    >
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-[color:var(--color-stone)] tabular-nums">
          {session.formatted_time}
        </p>
        <p className="truncate text-sm font-semibold text-[color:var(--color-ink)]">
          <Link
            href={`/studio/sessions/${session.id}`}
            className="hover:text-[color:var(--color-moss-deep)]"
          >
            {session.client_name ?? session.name ?? "Session"}
          </Link>
        </p>
      </div>
      {TypeSelect}
      {isRequested ? <Badge tone="signal">request</Badge> : null}
      {isCancelled ? <Badge tone="stone">cancelled</Badge> : null}
      {MenuBtn}
      {Menu}
    </div>
  );
}

function MenuItem({
  children,
  onClick,
  danger,
  asChild,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  danger?: boolean;
  asChild?: boolean;
}) {
  const classes = cn(
    "rounded-xl px-3 py-2 text-left text-sm transition-colors",
    danger
      ? "text-[color:var(--color-sienna)] hover:bg-[color:var(--color-sienna)]/10"
      : "text-[color:var(--color-ink)] hover:bg-[color:var(--color-parchment)]",
  );
  if (asChild) {
    return <div className={classes}>{children}</div>;
  }
  return (
    <button type="button" onClick={onClick} className={classes}>
      {children}
    </button>
  );
}
