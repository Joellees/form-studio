"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { revertSubscriptionToPending } from "@/app/studio/subscriptions/actions";

/**
 * Less-prominent revert affordance for subscriptions that were marked
 * paid more than 30 seconds ago (so the inline undo toast has gone).
 * Renders as a small kebab button on the "current block" card.
 * Tapping opens a tiny menu with "revert to pending" — a two-step
 * confirm prevents accidental reverts when the trainer is scrolling.
 */
export function RevertPaidMenu({ subscriptionId }: { subscriptionId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function revert() {
    setError(null);
    startTransition(async () => {
      const r = await revertSubscriptionToPending({ subscriptionId });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setOpen(false);
      setConfirming(false);
      router.refresh();
    });
  }

  return (
    <div className="relative">
      <button
        type="button"
        aria-label="block actions"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="inline-flex h-9 w-9 items-center justify-center rounded-full text-[color:var(--color-ink)]/60 transition-colors hover:bg-[color:var(--color-parchment)] hover:text-[color:var(--color-ink)]"
      >
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
          <circle cx="3" cy="7" r="1.2" fill="currentColor" />
          <circle cx="7" cy="7" r="1.2" fill="currentColor" />
          <circle cx="11" cy="7" r="1.2" fill="currentColor" />
        </svg>
      </button>
      {open ? (
        <>
          <div
            className="fixed inset-0 z-30"
            onClick={() => {
              setOpen(false);
              setConfirming(false);
            }}
            aria-hidden
          />
          <div className="absolute right-0 top-full z-40 mt-1 w-[240px] rounded-2xl border border-[color:var(--color-stone-soft)] bg-[color:var(--color-canvas)] p-1.5 shadow-[0_12px_32px_-8px_rgba(31,30,27,0.25)]">
            {confirming ? (
              <div className="px-3 py-2">
                <p className="text-xs text-[color:var(--color-ink)]/75">
                  Revert this block to pending? The client&rsquo;s session
                  credits will reset to zero.
                </p>
                <div className="mt-2 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={revert}
                    disabled={pending}
                    className="inline-flex h-8 items-center rounded-full bg-[color:var(--color-sienna)] px-3.5 text-xs font-medium text-[color:var(--color-canvas)] hover:bg-[color:var(--color-sienna)]/85 disabled:opacity-60"
                  >
                    {pending ? "reverting…" : "revert"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirming(false)}
                    disabled={pending}
                    className="text-xs text-[color:var(--color-stone)] hover:text-[color:var(--color-moss-deep)]"
                  >
                    cancel
                  </button>
                </div>
                {error ? (
                  <p className="mt-1 text-xs text-[color:var(--color-sienna)]">{error}</p>
                ) : null}
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setConfirming(true)}
                className="block w-full rounded-xl px-3 py-2 text-left text-sm text-[color:var(--color-sienna)] transition-colors hover:bg-[color:var(--color-parchment)]"
              >
                revert to pending
              </button>
            )}
          </div>
        </>
      ) : null}
    </div>
  );
}
