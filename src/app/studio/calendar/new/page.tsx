import { ScheduleForm } from "./schedule-form";
import { PageHeader } from "@/components/ui/page-header";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { requireTrainer } from "@/lib/trainer";

export const dynamic = "force-dynamic";

export default async function NewSessionPage({
  searchParams,
}: {
  searchParams: Promise<{ client?: string }>;
}) {
  const sp = await searchParams;
  const trainer = await requireTrainer();
  const admin = createSupabaseAdminClient();
  const [{ data: clients }, { data: templates }] = await Promise.all([
    admin
      .from("clients")
      .select(
        "id, display_name, subscriptions(id, sessions_remaining, payment_status, packages!subscriptions_package_id_fkey(name))",
      )
      .eq("tenant_id", trainer.id)
      .eq("active", true)
      .order("display_name"),
    admin
      .from("session_templates")
      .select("id, name")
      .eq("tenant_id", trainer.id)
      .eq("archived", false)
      .order("name"),
  ]);

  const clientsFlat = (clients ?? []).map((c) => {
    const subs = (c.subscriptions ?? []) as Array<{
      id: string;
      sessions_remaining: number;
      payment_status: string;
      packages: { name: string } | { name: string }[] | null;
    }>;
    const active = subs.find((s) => s.payment_status === "paid" && s.sessions_remaining > 0);
    const pkg = active && (Array.isArray(active.packages) ? active.packages[0] : active.packages);
    return {
      id: c.id,
      displayName: c.display_name,
      activeSubscriptionId: active?.id ?? null,
      sessionsRemaining: active?.sessions_remaining ?? 0,
      packageName: pkg?.name ?? null,
    };
  });

  return (
    <div className="mx-auto max-w-xl rise-in">
      <PageHeader
        eyebrow="calendar"
        title="Schedule a session."
        subtitle="pick a client, a time, and optionally a workout to prefill."
      />
      <ScheduleForm
        clients={clientsFlat}
        templates={templates ?? []}
        preselectClientId={sp.client}
      />
    </div>
  );
}
