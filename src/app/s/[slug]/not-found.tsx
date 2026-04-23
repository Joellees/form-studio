import Link from "next/link";

import { Wordmark } from "@/components/brand/wordmark";
import { env } from "@/lib/env";

export default function TrainerNotFound() {
  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col items-start justify-center px-6 py-16">
      <Wordmark variant="inline-platform" />
      <h1 className="mt-12 text-4xl">This studio isn&rsquo;t here.</h1>
      <p className="mt-4 text-[color:var(--color-ink)]/75">
        The address you followed doesn&rsquo;t match a trainer on Form Studio. The link may be
        outdated, or the studio may have moved.
      </p>
      <Link
        href={`${process.env.NEXT_PUBLIC_APP_URL ?? "/"}`}
        className="mt-8 rounded-xl border border-[color:var(--color-stone-soft)] px-4 py-2 text-sm hover:border-[color:var(--color-moss)]"
      >
        go to {env.NEXT_PUBLIC_ROOT_DOMAIN}
      </Link>
    </main>
  );
}
