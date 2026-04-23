"use client";

import { useEffect } from "react";

import { Button } from "@/components/ui/button";
import { Wordmark } from "@/components/brand/wordmark";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    // TODO: route to Sentry / Axiom / Logtail once wired
    console.error(error);
  }, [error]);

  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col items-start justify-center px-6 py-16">
      <Wordmark variant="inline-platform" />
      <h1 className="mt-12 font-display text-4xl">Something broke.</h1>
      <p className="mt-4 text-[color:var(--color-ink)]/75">
        This isn&rsquo;t how it should go. We&rsquo;ve captured what happened — try again, and if it
        keeps failing, let us know.
      </p>
      <div className="mt-8 flex gap-3">
        <Button onClick={reset}>try again</Button>
        <Button asChild variant="outline">
          <a href="/">home</a>
        </Button>
      </div>
    </main>
  );
}
