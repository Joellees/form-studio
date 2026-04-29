"use client";

import { useEffect } from "react";

import { Button } from "@/components/ui/button";

/**
 * Error boundary for the client portal surface. Keeps the portal
 * header mounted so the user can switch studios or retry without a
 * full reload.
 */
export default function ClientPortalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[client/error]", error);
  }, [error]);

  return (
    <div className="rise-in mx-auto flex max-w-md flex-col items-start py-12">
      <p className="text-xs font-medium uppercase tracking-[0.26em] text-[color:var(--color-sienna)]">
        something broke
      </p>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight md:text-3xl">
        We couldn&rsquo;t load this page.
      </h1>
      <p className="mt-3 text-sm text-[color:var(--color-ink)]/70">
        Try again, and if it keeps failing send your trainer the reference
        below.
      </p>
      {error.digest ? (
        <p className="mt-2 font-mono text-xs text-[color:var(--color-stone)]">
          ref: {error.digest}
        </p>
      ) : null}
      <Button onClick={reset} className="mt-6">
        try again
      </Button>
    </div>
  );
}
