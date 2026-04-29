"use client";

import { useEffect } from "react";

import { Button } from "@/components/ui/button";

/**
 * Error boundary for the trainer studio surface. A failure inside one
 * `/studio/*` route is caught here instead of rolling up to the global
 * boundary — the studio shell stays mounted, so the user can retry
 * without a full reload.
 */
export default function StudioError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[studio/error]", error);
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
        It&rsquo;s usually a one-off. Try again, and if it keeps failing send us the
        reference below.
      </p>
      {error.digest ? (
        <p className="mt-2 font-mono text-xs text-[color:var(--color-stone)]">
          ref: {error.digest}
        </p>
      ) : null}
      {process.env.NODE_ENV !== "production" ? (
        <pre className="mt-4 max-w-full overflow-auto rounded-xl bg-[color:var(--color-parchment)] p-3 text-xs text-[color:var(--color-ink)]">
          {error.message}
        </pre>
      ) : null}
      <Button onClick={reset} className="mt-6">
        try again
      </Button>
    </div>
  );
}
