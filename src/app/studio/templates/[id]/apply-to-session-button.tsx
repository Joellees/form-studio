"use client";

import { useEffect, useState, useTransition } from "react";

import { applyTemplateToSession } from "@/app/studio/sessions/[id]/actions";
import { listSessionsForApply } from "@/app/studio/templates/actions";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";

type ClientWithSessions = {
  id: string;
  display_name: string;
  sessions: Array<{
    id: string;
    scheduled_at: string;
    name: string | null;
    duration_minutes: number;
    status: string;
  }>;
};

/**
 * Trainer-facing modal launcher for "Apply this workout to a client
 * session." Opens a sheet that lists each client with their nearby
 * sessions (±21 days from now), filtered to non-cancelled. The
 * trainer picks one session and we call `applyTemplateToSession` to
 * copy the template's blocks/exercises/set_groups into it.
 *
 * The list of clients-with-sessions is fetched lazily on first open
 * via a server action so the template detail page itself doesn't
 * pay for the join if the modal is never used.
 *
 * Server-side: the same `applyTemplateToSession` action that the
 * session-builder's library sidebar uses for "tap to apply." Both
 * paths converge on identical writes (new session_blocks + their
 * exercises + their set groups with planned values copied).
 */
export function ApplyToSessionButton({
  templateId,
  templateName,
}: {
  templateId: string;
  templateName: string;
}) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [clients, setClients] = useState<ClientWithSessions[]>([]);
  const [pending, startTransition] = useTransition();

  /* Lazy-load on first open. After that the data is fresh enough
   * for typical use (a trainer applies, navigates, comes back) —
   * if it goes stale, closing + reopening will refetch. */
  useEffect(() => {
    if (!open || clients.length > 0 || loading) return;
    setLoading(true);
    setError(null);
    (async () => {
      const res = await listSessionsForApply();
      if (!res.ok) {
        setError(res.error || "Couldn't load your sessions.");
        setLoading(false);
        return;
      }
      setClients(res.data.clients);
      setLoading(false);
    })();
  }, [open, clients.length, loading]);

  /* Body-scroll lock + Esc-to-close, same shape as LibraryDock's
   * bottom sheet. */
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function applyTo(sessionId: string) {
    startTransition(async () => {
      const res = await applyTemplateToSession({ sessionId, templateId });
      if (!res.ok) {
        toast.error(res.error || "Couldn't apply the workout.");
        return;
      }
      const n = res.data.blocksAdded;
      toast.success(`applied to session — ${n} exercise${n === 1 ? "" : "s"} added.`);
      setOpen(false);
      /* Reset cached client list so the next open shows fresh state
       * (the trainer might apply to the same session again, or to
       * another one whose exercise count we want to know). */
      setClients([]);
    });
  }

  return (
    <>
      <Button onClick={() => setOpen(true)} variant="outline">
        Apply to session
      </Button>

      {open ? (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-[color:var(--color-ink)]/40 p-0 md:items-center md:p-6"
          onClick={() => setOpen(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="flex max-h-[85vh] w-full max-w-lg flex-col rounded-t-3xl bg-[color:var(--color-canvas)] shadow-[0_-12px_32px_-8px_rgba(31,30,27,0.35)] md:rounded-3xl"
          >
            <div className="flex items-start justify-between gap-4 px-5 py-4">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[color:var(--color-stone)]">
                  Apply workout
                </p>
                <h2 className="mt-1 text-lg font-semibold tracking-tight">{templateName}</h2>
                <p className="mt-1 text-xs text-[color:var(--color-ink)]/70">
                  Pick a client session to copy this workout&rsquo;s exercises into.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="close"
                className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[color:var(--color-stone)] hover:bg-[color:var(--color-parchment)]"
              >
                ×
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-5 pb-5">
              {loading ? (
                <p className="py-6 text-center text-sm text-[color:var(--color-ink)]/70">
                  Loading…
                </p>
              ) : error ? (
                <p className="text-sm text-[color:var(--color-sienna)]">{error}</p>
              ) : clients.length === 0 ? (
                <p className="py-6 text-center text-sm text-[color:var(--color-ink)]/70">
                  No upcoming or recent sessions found. Schedule one in
                  the calendar, then come back.
                </p>
              ) : (
                <ul className="space-y-4">
                  {clients.map((c) => (
                    <li key={c.id}>
                      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[color:var(--color-stone)]">
                        {c.display_name}
                      </p>
                      <ul className="mt-2 space-y-1">
                        {c.sessions.map((s) => (
                          <li key={s.id}>
                            <button
                              type="button"
                              disabled={pending}
                              onClick={() => applyTo(s.id)}
                              className="flex w-full items-center justify-between gap-3 rounded-2xl border border-[color:var(--color-stone-soft)]/60 bg-[color:var(--color-canvas)] px-4 py-3 text-left transition-colors hover:bg-[color:var(--color-parchment)]/60 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              <div className="min-w-0">
                                <p className="truncate text-sm font-medium">
                                  {s.name ?? "Session"}
                                </p>
                                <p className="mt-0.5 text-xs text-[color:var(--color-ink)]/70 tabular-nums">
                                  {formatSessionTime(s.scheduled_at)} · {s.duration_minutes}m
                                  {s.status === "completed" ? " · completed" : ""}
                                </p>
                              </div>
                              <span className="text-xs font-medium text-[color:var(--color-moss-deep)]">
                                apply →
                              </span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

/** Format a scheduled_at ISO timestamp in the trainer's local
 * locale; deliberately short so the picker list stays scannable.
 * Examples: "Tue, May 14 · 10:30", "Sun, May 19 · 17:00". */
function formatSessionTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}
