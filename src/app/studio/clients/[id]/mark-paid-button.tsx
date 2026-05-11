"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { markSubscriptionPaid } from "@/app/studio/subscriptions/actions";

/**
 * Inline "mark paid" button used on the client detail page next to the
 * "awaiting payment" card. Same server action as the dashboard's
 * action-feed row, scoped to one specific subscription.
 *
 * Two-step confirmation pattern: first tap turns the button into
 * "confirm mark paid" with a 4-second timeout that reverts. Stops
 * the trainer from misfiring on a tap. No modal because that's
 * overkill for a one-click action that's already idempotent server-
 * side.
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

  function arm() {
    setError(null);
    setConfirming(true);
    // Revert after 4 seconds so a stray tap doesn't sit in a "armed"
    // state forever.
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
      router.refresh();
    });
  }

  return (
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
  );
}
