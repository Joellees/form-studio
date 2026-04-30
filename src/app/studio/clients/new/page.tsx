import Link from "next/link";

import { InviteGenerator } from "./invite-generator";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { requireTrainer } from "@/lib/trainer";

export const dynamic = "force-dynamic";

export default async function NewClientPage() {
  const trainer = await requireTrainer();
  const admin = createSupabaseAdminClient();
  const { data: packages } = await admin
    .from("packages")
    .select("id, name, session_count, price_usd")
    .eq("tenant_id", trainer.id)
    .eq("active", true)
    .order("price_usd");

  return (
    <div className="mx-auto max-w-xl rise-in">
      <Link
        href="/studio/clients"
        className="inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-[0.18em] text-[color:var(--color-stone)] hover:text-[color:var(--color-moss-deep)]"
      >
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden>
          <path
            d="M6.5 1.5L3 5l3.5 3.5"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        back to clients
      </Link>
      <p className="mt-6 text-xs font-medium uppercase tracking-[0.26em] text-[color:var(--color-moss)]">
        clients
      </p>
      <h1 className="mt-2 text-3xl md:text-4xl">Invite a client.</h1>
      <p className="mt-3 text-[color:var(--color-ink)]/75">
        Generate a single-use link. Pick the package they&rsquo;ve agreed to so it&rsquo;s ready
        when they sign up — they can switch packages from their portal next month.
      </p>
      <InviteGenerator packages={packages ?? []} />
    </div>
  );
}
