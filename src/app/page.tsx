import { auth } from "@clerk/nextjs/server";
import Link from "next/link";

import { Wordmark } from "@/components/brand/wordmark";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * Root marketing page at formstudio.com.
 *
 * Trainer subdomains are rewritten to /s/[slug] in middleware; this
 * file never renders for those hosts.
 *
 * Header / hero are auth-aware:
 *   - signed out  → "create your studio" + "sign in"
 *   - signed in trainer → "go to my studio"
 *   - signed in client  → "go to my portal"
 *   - signed in but neither → "finish onboarding"
 */
export default async function RootPage() {
  const { userId } = await auth();

  // The body always renders the two-lane CTA (trainers / clients).
  // The header's "back to my studio/portal" shortcut is auth-aware so
  // signed-in users still get a one-click jump back into their app.
  let kind: "trainer" | "client" | "pending" | "none" = "none";

  if (userId) {
    const admin = createSupabaseAdminClient();
    const [{ data: trainer }, { data: clientRows }] = await Promise.all([
      admin.from("trainers").select("id").eq("clerk_id", userId).maybeSingle(),
      admin.from("clients").select("id").eq("clerk_id", userId).limit(1),
    ]);
    if (trainer) kind = "trainer";
    else if (clientRows && clientRows.length > 0) kind = "client";
    else kind = "pending";
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-[1180px] flex-col px-5 py-6 md:px-6 md:py-10">
      <header className="flex items-center justify-between">
        <Wordmark variant="inline-platform" />
        <HeaderAction kind={kind} />
      </header>

      <section className="mt-12 max-w-3xl rise-in md:mt-24">
        <p className="mb-5 text-xs font-medium uppercase tracking-[0.26em] text-[color:var(--color-moss)] md:mb-8">
          form studio · training, by hand
        </p>
        <h1 className="font-display text-[clamp(2.5rem,9vw,5.75rem)] leading-[0.95]">
          The studio software for trainers who think like{" "}
          <em
            className="italic"
            style={{ fontVariationSettings: '"WONK" 1, "SOFT" 40, "opsz" 144' }}
          >
            craftspeople
          </em>
          .
        </h1>
        <p className="mt-6 max-w-xl text-base text-[color:var(--color-ink)]/80 md:mt-8 md:text-lg">
          One studio. Your subdomain. Your exercise library, your session templates,
          your clients&rsquo; calendar — all in a space that looks and reads like yours.
        </p>
      </section>

      <section className="mt-10 flex flex-col items-start gap-4 rise-in md:mt-16">
        {/* Always show the two-lane CTA (trainers / clients) regardless
            of auth state — keeps the public-facing landing consistent
            and lets a signed-in trainer still demo the flow. The
            "open my studio" / "open my portal" shortcut stays in the
            header for one-click return. */}
        <PrimaryCta />
        <p className="text-xs text-[color:var(--color-stone)]">
          New clients — your trainer sends you an invite link. You don&rsquo;t need to sign up here.
        </p>
      </section>

      <section className="mt-16 grid gap-10 border-t border-[color:var(--color-stone-soft)] pt-10 md:mt-32 md:grid-cols-3 md:gap-16 md:pt-16">
        <Pillar
          index="01"
          title="your repertoire, reusable"
          body="Build your exercise library once. Every cue, every video, every set scheme stays — then appears, clean, inside every client&rsquo;s workout."
        />
        <Pillar
          index="02"
          title="one calendar, two sides"
          body="Trainers schedule. Clients request. Cancellation rules enforced by the server, not a spreadsheet."
        />
        <Pillar
          index="03"
          title="a page that looks like you"
          body="Your subdomain. Your cover. Your voice. No one mistakes it for a gym-app template."
        />
      </section>

      <footer className="mt-auto border-t border-[color:var(--color-stone-soft)] pb-4 pt-8 text-xs text-[color:var(--color-stone)] md:pt-10">
        <div className="flex items-center justify-between">
          <span>&copy; {new Date().getFullYear()} Form Studio</span>
          <span className="uppercase tracking-[0.26em]">made for trainers</span>
        </div>
      </footer>
    </main>
  );
}

function HeaderAction({
  kind,
}: {
  kind: "trainer" | "client" | "pending" | "none";
}) {
  if (kind === "none") {
    return (
      <Link
        href="/sign-in"
        className="text-sm text-[color:var(--color-ink)]/75 hover:text-[color:var(--color-moss-deep)]"
      >
        sign in
      </Link>
    );
  }
  // Signed-in users get a single "back to your studio/portal" link —
  // /me does the routing (trainer → studio, client → portal,
  // pending → onboarding).
  return (
    <Link
      href="/me"
      className="text-sm text-[color:var(--color-ink)]/75 hover:text-[color:var(--color-moss-deep)]"
    >
      go to my {kind === "client" ? "portal" : "studio"}
    </Link>
  );
}

function PrimaryCta() {
  const inkBtn =
    "inline-flex h-12 items-center justify-center rounded-full bg-[color:var(--color-ink)] px-7 text-[15px] font-medium text-[color:var(--color-canvas)] shadow-[0_1px_0_rgba(31,30,27,0.15),0_6px_18px_-8px_rgba(31,30,27,0.35)] hover:bg-[color:var(--color-moss-deep)]";
  const outlineBtn =
    "inline-flex h-12 items-center justify-center rounded-full border border-[color:var(--color-ink)]/20 bg-[color:var(--color-canvas)] px-7 text-[15px] font-medium text-[color:var(--color-ink)] hover:border-[color:var(--color-ink)]/40 hover:bg-[color:var(--color-parchment)]";

  // Two distinct entry points so trainers and clients know exactly
  // which lane is theirs. Trainers get sign-up (Clerk shows a "sign
  // in" link inside for returning trainers); clients never sign up
  // here — they always come back via sign-in.
  return (
    <div className="flex w-full flex-col gap-3 sm:flex-row sm:items-stretch">
      <div className="flex flex-1 flex-col gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[color:var(--color-stone)]">
          trainers
        </p>
        <Link href="/sign-up" className={inkBtn}>
          create or sign in to my studio
        </Link>
      </div>
      <div className="flex flex-1 flex-col gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[color:var(--color-stone)]">
          clients
        </p>
        <Link href="/sign-in" className={outlineBtn}>
          client login
        </Link>
      </div>
    </div>
  );
}

function Pillar({ index, title, body }: { index: string; title: string; body: string }) {
  return (
    <div>
      <span className="text-xs font-medium tracking-widest text-[color:var(--color-stone)]">
        {index}
      </span>
      <h3 className="mt-4 text-xl font-semibold tracking-tight">{title}</h3>
      <p className="mt-3 text-sm text-[color:var(--color-ink)]/75">{body}</p>
    </div>
  );
}
