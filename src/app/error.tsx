"use client";

import Link from "next/link";
import { useEffect } from "react";

import { Button } from "@/components/ui/button";
import { Wordmark } from "@/components/brand/wordmark";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("[error.tsx]", error);
  }, [error]);

  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col items-start justify-center px-6 py-16">
      <Wordmark variant="inline-platform" />
      <h1 className="mt-12 text-4xl">Something broke.</h1>
      <p className="mt-4 text-[color:var(--color-ink)]/75">
        This isn&rsquo;t how it should go. We&rsquo;ve captured what happened — try again, and if it
        keeps failing, let us know.
      </p>
      {error.digest ? (
        <p className="mt-2 font-mono text-xs text-[color:var(--color-stone)]">ref: {error.digest}</p>
      ) : null}
      {process.env.NODE_ENV !== "production" ? (
        <pre className="mt-4 max-w-full overflow-auto rounded-md bg-[color:var(--color-parchment)] p-3 text-xs text-[color:var(--color-ink)]">
          {error.message}
        </pre>
      ) : null}
      <div className="mt-8 flex gap-3">
        <Button onClick={reset}>try again</Button>
        <Button asChild variant="outline">
          <Link href="/">home</Link>
        </Button>
      </div>
    </main>
  );
}
