import Link from "next/link";

import { InviteGenerator } from "./invite-generator";
import { PageHeader } from "@/components/ui/page-header";
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
      <div className="mt-6">
        <PageHeader
          eyebrow="clients"
          title="Invite a client."
          subtitle="generate a single-use link, pick the package they've agreed to. they can switch packages from their portal next month."
        />
      </div>
      <InviteGenerator packages={packages ?? []} />
    </div>
  );
}
