import Link from "next/link";

import { Wordmark } from "@/components/brand/wordmark";

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col items-start justify-center px-6 py-16">
      <Wordmark variant="inline-platform" />
      <h1 className="mt-12 font-display text-4xl">Nothing lives here.</h1>
      <p className="mt-4 text-[color:var(--color-ink)]/75">
        The page you were looking for has moved or never existed.
      </p>
      <Link
        href="/"
        className="mt-8 rounded-md border border-[color:var(--color-stone-soft)] px-4 py-2 text-sm hover:border-[color:var(--color-moss)]"
      >
        go home
      </Link>
    </main>
  );
}
