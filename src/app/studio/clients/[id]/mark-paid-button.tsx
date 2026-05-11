"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";

import {
  markSubscriptionPaid,
  revertSubscriptionToPending,
} from "@/app/studio/subscriptions/actions";

/**
 * Inline "mark paid" affordance used on the client detail page next
 * to the "awaiting payment" card. Same server action as the
 * dashboard's action-feed row.
 *
 * Two-step confirmation pattern: first tap turns the button into
 * "confirm — $X" with a 4-second timeout that reverts. Stops the
 * trainer from misfiring on a tap. After a successful mark-paid, a
 * 30-second undo toast appears — tap it to revert. Beyond 30
 * seconds, the kebab menu on the "current block" card offers
 * "revert to pending" (a separate component, see RevertPaidMenu).
 *
 * Idempotent server-side, so a double-tap is safe.
 */
export function MarkPaidButton({
  subscriptionId,
  priceLabel,
}: {
  subscriptionId: string;
  priceLabel?: string | null;
}) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [undoToast, setUndoToast] = useState<{ shownAt: number } | null>(null);
  const [undoing, startUndo] = useTransition();
  const dismissTimer = useRef<number | null>(null);

  // Auto-dismiss the toast after 30 seconds. Beyond that window the
  // trainer uses the kebab menu (RevertPaidMenu) on the "current
  // block" card to revert — see the trainer client detail page.
  useEffect(() => {
    if (!undoToast) return;
    dismissTimer.current = window.setTimeout(() => setUndoToast(null), 30_000);
    return () => {
      if (dismissTimer.current) window.clearTimeout(dismissTimer.current);
    };
  }, [undoToast]);

  function arm() {
    setError(null);
    setConfirming(true);
    window.setTimeout(() => setConfirming(false), 4000);
  }

  function fire() {
    startTransition(async () => {
      const r = await markSubscriptionPaid({ subscriptionId });
      if (!r.ok) {
        setError(r.error);
        setConfirming(false);
        return;
      }
      setConfirming(false);
      setUndoToast({ shownAt: Date.now() });
      router.refresh();
    });
  }

  function undo() {
    if (dismissTimer.current) window.clearTimeout(dismissTimer.current);
    startUndo(async () => {
      const r = await revertSubscriptionToPending({ subscriptionId });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setUndoToast(null);
      router.refresh();
    });
  }

  return (
    <>
      <div className="flex items-center gap-2">
        {confirming ? (
          <>
            <button
              type="button"
              onClick={fire}
              disabled={pending}
              className="inline-flex h-9 items-center rounded-full bg-[color:var(--color-ink)] px-4 text-xs font-medium text-[color:var(--color-canvas)] hover:bg-[color:var(--color-moss-deep)] disabled:opacity-60"
            >
              {pending
                ? "marking…"
                : priceLabel
                  ? `confirm — ${priceLabel}`
                  : "confirm mark paid"}
            </button>
            <button
              type="button"
              onClick={() => setConfirming(false)}
              disabled={pending}
              className="text-xs text-[color:var(--color-stone)] hover:text-[color:var(--color-moss-deep)]"
            >
              cancel
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={arm}
            disabled={pending}
            className="inline-flex h-9 items-center rounded-full bg-[color:var(--color-ink)] px-4 text-xs font-medium text-[color:var(--color-canvas)] hover:bg-[color:var(--color-moss-deep)] disabled:opacity-60"
          >
            mark paid
          </button>
        )}
        {error ? (
          <p className="text-xs text-[color:var(--color-sienna)]">{error}</p>
        ) : null}
      </div>

      {undoToast ? (
        <UndoToast
          onUndo={undo}
          onDismiss={() => setUndoToast(null)}
          pending={undoing}
        />
      ) : null}
    </>
  );
}

/**
 * Floating bottom-right toast that the trainer can tap to revert a
 * just-marked-paid subscription. 30-second auto-dismiss. The toast
 * is rendered inline (no portal) because it doesn't need to escape
 * any clipping ancestor on the client-detail page; if a future
 * regression contains it inside something with backdrop-filter, the
 * fix is to wrap in createPortal.
 */
function UndoToast({
  onUndo,
  onDismiss,
  pending,
}: {
  onUndo: () => void;
  onDismiss: () => void;
  pending: boolean;
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-4 left-1/2 z-50 flex w-[min(360px,calc(100vw-2rem))] -translate-x-1/2 items-center justify-between gap-3 rounded-full bg-[color:var(--color-ink)] px-5 py-3 text-sm text-[color:var(--color-canvas)] shadow-[0_12px_32px_-8px_rgba(31,30,27,0.45)]"
      style={{
        bottom: "calc(env(safe-area-inset-bottom, 0px) + 1rem)",
      }}
    >
      <span>Marked paid.</span>
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onUndo}
          disabled={pending}
          className="text-xs font-semibold uppercase tracking-[0.18em] text-[color:var(--color-canvas)] underline-offset-2 hover:underline disabled:opacity-60"
        >
          {pending ? "undoing…" : "undo"}
        </button>
        <button
          type="button"
          onClick={onDismiss}
          aria-label="dismiss"
          className="inline-flex h-6 w-6 items-center justify-center rounded-full text-[color:var(--color-canvas)]/65 hover:text-[color:var(--color-canvas)]"
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden>
            <path d="M3 3l6 6M9 3l-6 6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
        </button>
      </div>
    </div>
  );
}
