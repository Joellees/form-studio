import { auth } from "@clerk/nextjs/server";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { Wordmark } from "@/components/brand/wordmark";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ code: string }> };

/**
 * Client invite landing.
 *
 * Branching (mobile-first, edge-light):
 *
 *   signed-in + invite already claimed  → /client (idempotent)
 *   signed-in + invite unclaimed        → /invite/[code]/claim (silent
 *                                          consume, then /client)
 *   signed-out + invite unclaimed       → render the new landing UI
 *                                          below. One CTA: Continue →
 *                                          Clerk sign-up → /claim.
 *
 * The landing UI introduces the trainer warmly and shows the plan
 * name (without prices, fees, or payment language). The plan card
 * never mentions money. The client gets into their dashboard before
 * any pricing conversation happens — payment with the trainer is
 * out-of-band (Whish / cash / bank transfer) during Beta 2.
 */
export default async function InvitePage({ params }: Props) {
  const { code } = await params;
  const admin = createSupabaseAdminClient();

  const { data: invite } = await admin
    .from("client_invites")
    .select(
      "code, claimed_at, trainers(display_name, subdomain_slug), packages(name, session_count)",
    )
    .eq("code", code.toUpperCase())
    .maybeSingle();

  if (!invite) notFound();

  const trainersRel = invite.trainers as
    | { display_name: string; subdomain_slug: string }
    | Array<{ display_name: string; subdomain_slug: string }>
    | null;
  const trainer = Array.isArray(trainersRel) ? trainersRel[0] ?? null : trainersRel;
  const trainerName = trainer?.display_name ?? "Your trainer";
  const firstName = trainerName.split(" ")[0] ?? trainerName;

  const pkgRel = invite.packages as
    | { name: string; session_count: number }
    | Array<{ name: string; session_count: number }>
    | null;
  const pkg = Array.isArray(pkgRel) ? pkgRel[0] ?? null : pkgRel;

  const { userId } = await auth();
  const claimPath = `/invite/${invite.code}/claim`;

  // Signed-in users skip the landing — let the claim route handle
  // both "already claimed" (redirect to /client) and "claim now"
  // (consume + redirect to /client) without a UI hop.
  if (userId) {
    redirect(claimPath);
  }

  // Used-by-someone-else state for signed-out visitors (rare —
  // usually the trainer would forward a fresh link).
  if (invite.claimed_at) {
    return (
      <main className="rise-in mx-auto flex min-h-screen max-w-md flex-col items-start justify-center px-5 py-10 md:px-6 md:py-16">
        <Wordmark variant="inline" name={firstName} />
        <h1 className="mt-10 text-3xl font-semibold tracking-tight">
          This invite has been used.
        </h1>
        <p className="mt-3 text-[color:var(--color-ink)]/75">
          Ask {firstName} for a fresh link if you still need access.
        </p>
        <Link
          href="/sign-in"
          className="mt-6 text-sm text-[color:var(--color-stone)] hover:text-[color:var(--color-moss-deep)]"
        >
          already have an account? sign in
        </Link>
      </main>
    );
  }

  const signUpHref = `/sign-up?redirect_url=${encodeURIComponent(claimPath)}`;
  const signInHref = `/sign-in?redirect_url=${encodeURIComponent(claimPath)}`;

  return (
    <main className="rise-in mx-auto flex min-h-screen max-w-md flex-col px-5 py-10 md:px-6 md:py-16">
      <Wordmark variant="inline" name={firstName} />

      <section className="mt-10 md:mt-16">
        <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">
          {firstName} invited you to train.
        </h1>
        <p className="mt-3 text-[color:var(--color-ink)]/75">
          Create an account — your studio will be ready in a second.
        </p>
      </section>

      {pkg ? (
        <section className="mt-8 w-full rounded-3xl bg-[color:var(--color-parchment)] p-5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[color:var(--color-stone)]">
            your plan
          </p>
          <p className="mt-2 text-lg font-semibold tracking-tight">{pkg.name}</p>
          <p className="mt-1 text-sm text-[color:var(--color-ink)]/70">
            {pkg.session_count} session{pkg.session_count === 1 ? "" : "s"} per month with {firstName}.
          </p>
        </section>
      ) : null}

      <div className="mt-8 flex flex-col gap-3">
        <Link
          href={signUpHref}
          className="inline-flex h-12 items-center justify-center rounded-full bg-[color:var(--color-ink)] px-7 text-[15px] font-medium text-[color:var(--color-canvas)] shadow-[0_1px_0_rgba(31,30,27,0.15),0_6px_18px_-8px_rgba(31,30,27,0.35)] hover:bg-[color:var(--color-moss-deep)]"
        >
          continue
        </Link>
        <Link
          href={signInHref}
          className="text-center text-sm text-[color:var(--color-stone)] hover:text-[color:var(--color-moss-deep)]"
        >
          already have an account? sign in
        </Link>
      </div>
    </main>
  );
}
