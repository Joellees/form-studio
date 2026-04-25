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
      <p className="text-xs font-medium uppercase tracking-[0.26em] text-[color:var(--color-moss)]">clients</p>
      <h1 className="mt-2 text-4xl">Invite a client.</h1>
      <p className="mt-3 text-[color:var(--color-ink)]/75">
        Generate a single-use link. Pick the package they&rsquo;ve agreed to so it&rsquo;s ready
        when they sign up — they can switch packages from their portal next month.
      </p>
      <InviteGenerator packages={packages ?? []} />
    </div>
  );
}
