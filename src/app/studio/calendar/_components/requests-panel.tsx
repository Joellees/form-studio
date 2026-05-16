"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import {
  approveSessionRequest,
  declineSessionRequest,
} from "../actions";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";

export type PendingRequest = {
  id: string;
  scheduledLabel: string;
  durationMinutes: number;
  clientName: string;
  /** Optional client-side note attached when the request was made. */
  clientNote: string | null;
};

/**
 * Dedicated queue for client session requests at the top of the
 * trainer's calendar. Separates the request-approval lifecycle from
 * the regular calendar grid:
 *
 *   - Approve = `approveSessionRequest` (existing action) — flips
 *     status='requested' → 'scheduled' and decrements the client's
 *     active subscription count for the typical (non-in-app)
 *     session types.
 *
 *   - Decline = `declineSessionRequest` (new action) — sets
 *     status='declined' and optionally stores a short trainer note
 *     on `sessions.notes` that the client sees in their portal. No
 *     credit accounting because the request never decremented.
 *
 * Why this lives outside the calendar grid:
 *   - Pre-change, requests were rendered as regular session cards
 *     with a `request` badge, and approve/decline lived inside a
 *     per-row ⋯ menu. Trainer feedback was that mixing requests
 *     with scheduled sessions made the grid noisy and the ⋯ menu
 *     unscannable. Pulling them into a queue at the top makes
 *     "what needs my attention right now" obvious.
 *
 * Hidden entirely when there are no pending requests — no empty-
 * state copy at all so the panel doesn't take up space on quiet
 * days. The empty-state line shows only inside the (rarer) view
 * where the trainer expands the panel from a closed state.
 */
export function RequestsPanel({ requests }: { requests: PendingRequest[] }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  /* Which request currently has the decline-note draft open. Map
   * keyed by id → note string. Storing the per-id draft locally
   * (rather than one shared "active decline" pointer) lets the
   * trainer start declining multiple requests in any order without
   * losing notes when they switch between cards. */
  const [declineDrafts, setDeclineDrafts] = useState<Record<string, string>>({});
  const [showingDeclineFor, setShowingDeclineFor] = useState<Set<string>>(new Set());

  if (requests.length === 0) return null;

  function approve(id: string) {
    startTransition(async () => {
      const res = await approveSessionRequest(id);
      if (!res.ok) {
        toast.error(res.error || "Couldn't approve. Try again.");
        return;
      }
      toast.success("Request approved.");
      router.refresh();
    });
  }

  function openDecline(id: string) {
    setShowingDeclineFor((s) => new Set(s).add(id));
  }

  function cancelDecline(id: string) {
    setShowingDeclineFor((s) => {
      const next = new Set(s);
      next.delete(id);
      return next;
    });
    setDeclineDrafts((d) => {
      const { [id]: _drop, ...rest } = d;
      void _drop;
      return rest;
    });
  }

  function confirmDecline(id: string) {
    const note = (declineDrafts[id] ?? "").trim();
    startTransition(async () => {
      const res = await declineSessionRequest({
        sessionId: id,
        ...(note ? { note } : {}),
      });
      if (!res.ok) {
        toast.error(res.error || "Couldn't decline. Try again.");
        return;
      }
      toast.success("Request declined.");
      cancelDecline(id);
      router.refresh();
    });
  }

  return (
    <section
      aria-label="pending session requests"
      className="rounded-3xl border border-[color:var(--color-stone-soft)]/60 bg-[color:var(--color-parchment)]/40 p-4 md:p-5"
    >
      <div className="flex items-center justify-between gap-3">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[color:var(--color-moss)]">
          Requests
        </p>
        <span className="text-[11px] tabular-nums text-[color:var(--color-stone)]">
          {requests.length} pending
        </span>
      </div>
      <ul className="mt-3 space-y-2">
        {requests.map((r) => {
          const declineOpen = showingDeclineFor.has(r.id);
          return (
            <li
              key={r.id}
              className="rounded-2xl bg-[color:var(--color-canvas)] p-3 md:p-4"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-[color:var(--color-ink)]">
                    {r.clientName}
                  </p>
                  <p className="mt-0.5 text-xs text-[color:var(--color-ink)]/70 tabular-nums">
                    {r.scheduledLabel} · {r.durationMinutes}m
                  </p>
                  {r.clientNote ? (
                    <p className="mt-2 whitespace-pre-line rounded-xl bg-[color:var(--color-parchment)]/60 px-3 py-2 text-xs text-[color:var(--color-ink)]/80">
                      “{r.clientNote}”
                    </p>
                  ) : null}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => openDecline(r.id)}
                    disabled={pending || declineOpen}
                  >
                    decline
                  </Button>
                  <Button size="sm" onClick={() => approve(r.id)} disabled={pending}>
                    approve
                  </Button>
                </div>
              </div>
              {declineOpen ? (
                <div className="mt-3 border-t border-[color:var(--color-stone-soft)]/40 pt-3">
                  <Textarea
                    rows={2}
                    placeholder="optional — note to the client about why"
                    value={declineDrafts[r.id] ?? ""}
                    onChange={(e) =>
                      setDeclineDrafts((d) => ({ ...d, [r.id]: e.target.value }))
                    }
                    disabled={pending}
                  />
                  <div className="mt-2 flex items-center justify-end gap-2">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => cancelDecline(r.id)}
                      disabled={pending}
                    >
                      cancel
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => confirmDecline(r.id)}
                      disabled={pending}
                    >
                      confirm decline
                    </Button>
                  </div>
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
