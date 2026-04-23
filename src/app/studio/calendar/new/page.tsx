import { ScheduleForm } from "./schedule-form";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function NewSessionPage() {
  const supabase = await createSupabaseServerClient();
  const [{ data: clients }, { data: templates }] = await Promise.all([
    supabase
      .from("clients")
      .select("id, display_name, subscriptions(id, sessions_remaining, payment_status, packages(name))")
      .eq("active", true)
      .order("display_name"),
    supabase.from("session_templates").select("id, name").eq("archived", false).order("name"),
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
      <p className="text-xs font-medium uppercase tracking-[0.26em] text-[color:var(--color-moss)]">calendar</p>
      <h1 className="mt-2 font-display text-4xl">Schedule a session.</h1>
      <p className="mt-3 text-[color:var(--color-ink)]/75">
        Pick a client, a time, and optionally clone a template to prescribe what&rsquo;s in the session.
      </p>
      <ScheduleForm clients={clientsFlat} templates={templates ?? []} />
    </div>
  );
}
