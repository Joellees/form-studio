"use client";

import Link from "next/link";
import { useState } from "react";

type Subscriber = {
  clientId: string;
  clientName: string;
  status: "active" | "pending" | "expired";
  sessionsRemaining: number;
};

/**
 * Compact "members on this package" disclosure. Hidden by default —
 * trainer taps the count chip to expand a list of clients with their
 * subscription state. Keeps the packages overview from drowning in
 * detail; one tap reveals everyone in a block.
 */
export function SubscriberList({
  subscribers,
}: {
  subscribers: Subscriber[];
}) {
  const [open, setOpen] = useState(false);

  if (subscribers.length === 0) {
    return (
      <span className="text-[11px] uppercase tracking-[0.16em] text-[color:var(--color-stone)]">
        no clients yet
      </span>
    );
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1.5 rounded-full bg-[color:var(--color-canvas)] px-3 py-1 text-xs font-medium text-[color:var(--color-ink)] hover:bg-[color:var(--color-parchment)]/60"
        aria-expanded={open}
      >
        <span className="tabular-nums">{subscribers.length}</span>
        <span className="text-[color:var(--color-stone)]">
          {subscribers.length === 1 ? "client" : "clients"}
        </span>
        <svg
          width="10"
          height="10"
          viewBox="0 0 10 10"
          fill="none"
          aria-hidden
          className={`transition-transform ${open ? "rotate-180" : ""}`}
        >
          <path d="M2 4l3 3 3-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </button>
      {open ? (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <ul className="absolute right-0 top-full z-40 mt-1 max-h-[320px] min-w-[260px] overflow-y-auto rounded-2xl border border-[color:var(--color-stone-soft)] bg-[color:var(--color-canvas)] p-1 shadow-[0_12px_32px_-8px_rgba(31,30,27,0.25)]">
            {subscribers.map((s) => (
              <li key={s.clientId}>
                <Link
                  href={`/studio/clients/${s.clientId}`}
                  className="flex items-center justify-between gap-3 rounded-xl px-3 py-2 text-sm hover:bg-[color:var(--color-parchment)]"
                >
                  <span className="truncate font-medium">{s.clientName}</span>
                  <span
                    className={`text-[10px] uppercase tracking-[0.16em] ${
                      s.status === "active"
                        ? "text-[color:var(--color-moss-deep)]"
                        : s.status === "pending"
                          ? "text-[color:var(--color-sienna)]"
                          : "text-[color:var(--color-stone)]"
                    }`}
                  >
                    {s.status === "active"
                      ? `${s.sessionsRemaining} left`
                      : s.status}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </div>
  );
}
