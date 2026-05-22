"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";

import { listClientsForAssign } from "../actions";
import { assignPackage } from "@/app/studio/subscriptions/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";

type ClientOption = {
  id: string;
  display_name: string;
  email: string | null;
  already_assigned: boolean;
};

/**
 * Trainer-facing entry point for "assign this package to N clients
 * in one go." A small button — usable on the package detail page
 * header or per-row on the list view — opens a sheet/modal with a
 * search-as-you-type multi-select.
 *
 * Wiring contract:
 *
 *   - Client list comes from `listClientsForAssign` (this branch).
 *     Returns each active client + an `already_assigned` flag for
 *     clients with a live paid subscription for THIS package.
 *
 *   - The bulk-assign itself loops the EXISTING server action
 *     `assignPackage` (`src/app/studio/subscriptions/actions.ts`)
 *     client-side, one call per selected client. We honour the
 *     spec's "reuse the existing assignment logic" by not adding a
 *     wrapper — the canonical flow stays the single source of
 *     truth, and the toast simply counts successes vs failures
 *     from the parallel calls.
 *
 *   - The client-profile assignment flow
 *     (`/studio/clients/[id]/assign-package.tsx`) is intentionally
 *     left untouched. It uses the same underlying action; this is
 *     just a second entry point.
 *
 *   - Duplicate handling matches the existing client-profile flow:
 *     `assignPackage` doesn't block duplicates — it inserts a new
 *     subscription each call. The picker surfaces `already_assigned`
 *     inline so the trainer can choose to skip those rows
 *     manually; nothing is auto-blocked.
 */
export function AssignToClientsButton({
  packageId,
  packageName,
  buttonLabel = "Assign to clients",
  buttonVariant = "outline",
  buttonSize = "md",
}: {
  packageId: string;
  packageName: string;
  buttonLabel?: string;
  buttonVariant?: "primary" | "secondary" | "outline" | "ghost";
  buttonSize?: "sm" | "md" | "lg" | "icon";
}) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [markPaid, setMarkPaid] = useState(false);
  const [query, setQuery] = useState("");
  const [submitting, startSubmit] = useTransition();

  /* Lazy-load the client list on first open. Refetch on close +
   * reopen, since assignments completed in this session change the
   * `already_assigned` flags. */
  useEffect(() => {
    if (!open || clients.length > 0 || loading) return;
    setLoading(true);
    setLoadError(null);
    (async () => {
      const res = await listClientsForAssign({ packageId });
      if (!res.ok) {
        setLoadError(res.error || "Couldn't load your clients.");
        setLoading(false);
        return;
      }
      setClients(res.data.clients);
      setLoading(false);
    })();
  }, [open, clients.length, loading, packageId]);

  /* Body-scroll lock + Esc to close. Matches `LibraryDock` and
   * `ApplyToSessionButton`. */
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

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return clients;
    return clients.filter((c) => {
      const name = c.display_name.toLowerCase();
      const email = (c.email ?? "").toLowerCase();
      return name.includes(q) || email.includes(q);
    });
  }, [clients, query]);

  /* Selected chips persist their full client record so they keep
   * displaying after the search filters them out of `filtered`. */
  const selectedClients = useMemo(
    () => clients.filter((c) => selected.has(c.id)),
    [clients, selected],
  );

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function reset() {
    setSelected(new Set());
    setMarkPaid(false);
    setQuery("");
  }

  function close() {
    setOpen(false);
    reset();
    /* Drop cached client list so the next open re-fetches the
     * already-assigned flags (the just-made assignments invalidate
     * the prior flag state). */
    setClients([]);
  }

  async function submit() {
    const ids = Array.from(selected);
    if (ids.length === 0) return;

    startSubmit(async () => {
      const results = await Promise.all(
        ids.map((clientId) =>
          assignPackage({ clientId, packageId, markPaid }).then(
            (r) => ({ clientId, ok: r.ok, error: !r.ok ? r.error : undefined }),
            (err) => ({
              clientId,
              ok: false,
              error: err instanceof Error ? err.message : "Unknown error",
            }),
          ),
        ),
      );

      const succeeded = results.filter((r) => r.ok).length;
      const failed = results.length - succeeded;

      if (succeeded > 0) {
        toast.success(
          `Assigned to ${succeeded} client${succeeded === 1 ? "" : "s"}${
            failed > 0 ? ` · ${failed} failed` : ""
          }.`,
        );
      }
      if (failed > 0 && succeeded === 0) {
        toast.error(
          `Couldn't assign — ${failed} client${failed === 1 ? "" : "s"} failed. Try again.`,
        );
      }

      close();
      /* `router.refresh()` re-fetches the list page server data so
       * the SubscriberList chip count on each package row updates
       * without a hard reload. */
      router.refresh();
    });
  }

  return (
    <>
      <Button onClick={() => setOpen(true)} variant={buttonVariant} size={buttonSize}>
        {buttonLabel}
      </Button>

      {open ? (
        <div
          className="dialog-overlay-in fixed inset-0 z-50 flex items-end justify-center bg-[color:var(--color-ink)]/30 p-0 backdrop-blur-sm md:items-center md:p-6"
          onClick={close}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="dialog-content-rise flex max-h-[90vh] w-full max-w-lg flex-col rounded-t-3xl bg-[color:var(--color-canvas)] shadow-[0_24px_64px_-16px_rgba(31,30,27,0.35)] md:rounded-3xl"
          >
            {/* Header */}
            <div className="flex items-start justify-between gap-4 px-5 py-4">
              <div className="min-w-0">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[color:var(--color-stone)]">
                  assign
                </p>
                <h2 className="mt-1 truncate text-lg font-semibold tracking-tight">
                  {packageName}
                </h2>
              </div>
              <button
                type="button"
                onClick={close}
                aria-label="close"
                className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[color:var(--color-stone)] hover:bg-[color:var(--color-parchment)]"
              >
                ×
              </button>
            </div>

            {/* Selected chips (only render when something is selected) */}
            {selectedClients.length > 0 ? (
              <div className="flex flex-wrap gap-1.5 border-t border-[color:var(--color-stone-soft)]/60 px-5 py-3">
                {selectedClients.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => toggle(c.id)}
                    className="inline-flex items-center gap-1.5 rounded-full bg-[color:var(--color-ink)] px-3 py-1 text-xs text-[color:var(--color-canvas)] hover:bg-[color:var(--color-moss-deep)]"
                    aria-label={`remove ${c.display_name}`}
                  >
                    <span className="max-w-[160px] truncate">{c.display_name}</span>
                    <span aria-hidden>×</span>
                  </button>
                ))}
              </div>
            ) : null}

            {/* Search */}
            <div className="border-t border-[color:var(--color-stone-soft)]/60 px-5 py-3">
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="search clients"
                disabled={loading}
              />
            </div>

            {/* Client list */}
            <div className="flex-1 overflow-y-auto px-3 pb-2">
              {loading ? (
                <p className="py-6 text-center text-sm text-[color:var(--color-ink)]/70">
                  Loading…
                </p>
              ) : loadError ? (
                <p className="px-2 py-3 text-sm text-[color:var(--color-sienna)]">{loadError}</p>
              ) : clients.length === 0 ? (
                <div className="flex flex-col items-start gap-3 px-2 py-6">
                  <p className="text-sm text-[color:var(--color-ink)]/70">No clients yet.</p>
                  <Link
                    href="/studio/clients/new"
                    className="text-sm font-medium text-[color:var(--color-moss-deep)] underline underline-offset-4 hover:text-[color:var(--color-ink)]"
                    onClick={close}
                  >
                    Invite a client →
                  </Link>
                </div>
              ) : filtered.length === 0 ? (
                <p className="px-2 py-3 text-sm text-[color:var(--color-ink)]/70">
                  No matches — try a different search.
                </p>
              ) : (
                <ul className="space-y-1">
                  {filtered.map((c) => {
                    const isSelected = selected.has(c.id);
                    return (
                      <li key={c.id}>
                        <label
                          className={`flex cursor-pointer items-center gap-3 rounded-xl px-2 py-2 transition-colors ${
                            isSelected
                              ? "bg-[color:var(--color-parchment)]"
                              : "hover:bg-[color:var(--color-parchment)]/60"
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggle(c.id)}
                            className="h-4 w-4 shrink-0 cursor-pointer accent-[color:var(--color-ink)]"
                          />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium">{c.display_name}</p>
                            {c.email ? (
                              <p className="truncate text-xs text-[color:var(--color-ink)]/60">
                                {c.email}
                              </p>
                            ) : null}
                          </div>
                          {c.already_assigned ? (
                            <span className="shrink-0 text-[11px] italic text-[color:var(--color-stone)]">
                              already assigned
                            </span>
                          ) : null}
                        </label>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            {/* Mark-paid toggle + confirm */}
            <div className="space-y-3 border-t border-[color:var(--color-stone-soft)]/60 px-5 py-4">
              <label className="flex cursor-pointer items-center justify-between gap-3 rounded-2xl bg-[color:var(--color-parchment)] px-4 py-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold">mark all as paid</p>
                  <p className="text-xs text-[color:var(--color-ink)]/70">
                    Sessions unlock immediately. Off = pending until you confirm payment.
                  </p>
                </div>
                <input
                  type="checkbox"
                  checked={markPaid}
                  onChange={(e) => setMarkPaid(e.target.checked)}
                  className="h-5 w-5 cursor-pointer accent-[color:var(--color-ink)]"
                />
              </label>

              <div className="flex items-center justify-end gap-2">
                <Button variant="ghost" onClick={close} disabled={submitting}>
                  cancel
                </Button>
                {/* The 0-selected state was rendering an active-
                  * looking button labelled "Assign to 0 clients" —
                  * the button was disabled but the label was
                  * misleading. Now: a calmer "assign" label,
                  * count appended only when > 0, button stays
                  * disabled until something's picked. */}
                <Button onClick={submit} disabled={submitting || selected.size === 0}>
                  {submitting
                    ? "assigning…"
                    : selected.size === 0
                      ? "assign"
                      : `assign to ${selected.size} client${selected.size === 1 ? "" : "s"}`}
                </Button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
