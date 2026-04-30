import Link from "next/link";

import { ClientsList, type ClientRow } from "./clients-list";
import { Button } from "@/components/ui/button";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { requireTrainer } from "@/lib/trainer";

export const dynamic = "force-dynamic";

type SubLite = {
  id: string;
  start_date: string | null;
  end_date: string | null;
  sessions_remaining: number;
  payment_status: string;
  packages: { name: string; session_count: number } | { name: string; session_count: number }[] | null;
};

function pkgOf(s: SubLite) {
  return Array.isArray(s.packages) ? s.packages[0] ?? null : s.packages;
}

/**
 * Distill a client&rsquo;s subscriptions into a single status the UI uses
 * for sorting + the badge. Order of preference:
 *   1. paid + sessions remaining + ending in <7d  → ending_soon
 *   2. paid + sessions remaining                  → active
 *   3. payment_status pending                     → pending_pay
 *   4. archived flag                              → archived
 *   5. otherwise                                  → no_plan
 */
function statusFor(subs: SubLite[], active: boolean): ClientRow["status"] {
  if (!active) return "archived";
  const today = new Date().toISOString().slice(0, 10);
  const livePaid = subs.find(
    (s) => s.payment_status === "paid" && (s.end_date ?? "9999-12-31") >= today && s.sessions_remaining > 0,
  );
  if (livePaid) {
    if (livePaid.end_date) {
      const days = Math.ceil(
        (new Date(livePaid.end_date).getTime() - new Date(today).getTime()) / 86400_000,
      );
      if (days <= 7) return "ending_soon";
    }
    return "active";
  }
  if (subs.some((s) => s.payment_status === "pending")) return "pending_pay";
  return "no_plan";
}

function packageInfoFor(subs: SubLite[], active: boolean): {
  packageName: string | null;
  sessionsDone: number | null;
  sessionsTotal: number | null;
  endDate: string | null;
} {
  if (!active) return { packageName: null, sessionsDone: null, sessionsTotal: null, endDate: null };
  const today = new Date().toISOString().slice(0, 10);
  const live = subs.find(
    (s) => s.payment_status === "paid" && (s.end_date ?? "9999-12-31") >= today && s.sessions_remaining > 0,
  );
  if (live) {
    const pkg = pkgOf(live);
    const total = pkg?.session_count ?? live.sessions_remaining;
    const done = Math.max(0, total - live.sessions_remaining);
    return {
      packageName: pkg?.name ?? "Package",
      sessionsDone: done,
      sessionsTotal: total,
      endDate: live.end_date,
    };
  }
  const pending = subs.find((s) => s.payment_status === "pending");
  if (pending) {
    const pkg = pkgOf(pending);
    return {
      packageName: pkg?.name ?? "Package",
      sessionsDone: null,
      sessionsTotal: null,
      endDate: pending.end_date,
    };
  }
  return { packageName: null, sessionsDone: null, sessionsTotal: null, endDate: null };
}

export default async function ClientsPage({
  searchParams,
}: {
  searchParams: Promise<{ archived?: string }>;
}) {
  const sp = await searchParams;
  const showArchived = sp.archived === "1";
  const trainer = await requireTrainer();
  const admin = createSupabaseAdminClient();

  const [{ data: clients }, { count: archivedCount }, { count: activeCount }, { data: lastSessions }] =
    await Promise.all([
      admin
        .from("clients")
        // Subscriptions has two FKs to packages (package_id and
        // pending_package_id) — disambiguate explicitly with the
        // `packages!subscriptions_package_id_fkey` hint, otherwise
        // PostgREST errors PGRST201 and silently returns null data.
        .select(
          `id, display_name, email, phone, active, created_at,
           subscriptions(id, start_date, end_date, sessions_remaining, payment_status, packages!subscriptions_package_id_fkey(name, session_count))`,
        )
        .eq("tenant_id", trainer.id)
        .eq("active", !showArchived)
        .order("created_at", { ascending: false }),
      admin
        .from("clients")
        .select("*", { count: "exact", head: true })
        .eq("tenant_id", trainer.id)
        .eq("active", false),
      admin
        .from("clients")
        .select("*", { count: "exact", head: true })
        .eq("tenant_id", trainer.id)
        .eq("active", true),
      // Most recent session per client — we only need the date so we
      // pull all completed sessions and reduce in code. Limit by status
      // so future scheduled sessions don't pose as "last seen".
      admin
        .from("sessions")
        .select("client_id, scheduled_at, status")
        .eq("tenant_id", trainer.id)
        .in("status", ["completed", "scheduled", "cancelled"])
        .order("scheduled_at", { ascending: false }),
    ]);

  // Reduce sessions to "most recent past session per client" — that's
  // the "last seen" number trainers actually scan for.
  const now = Date.now();
  const lastByClient = new Map<string, string>();
  for (const s of lastSessions ?? []) {
    const t = new Date(s.scheduled_at as string).getTime();
    if (t > now) continue; // future scheduled — not a "last seen"
    if (s.status === "cancelled") continue;
    const id = s.client_id as string;
    if (!lastByClient.has(id)) lastByClient.set(id, s.scheduled_at as string);
  }

  const rows: ClientRow[] = (clients ?? []).map((c) => {
    const subs = (c.subscriptions ?? []) as SubLite[];
    const pkgInfo = packageInfoFor(subs, c.active as boolean);
    return {
      id: c.id as string,
      displayName: c.display_name as string,
      email: (c.email as string) ?? null,
      phone: (c.phone as string) ?? null,
      status: statusFor(subs, c.active as boolean),
      packageName: pkgInfo.packageName,
      sessionsDone: pkgInfo.sessionsDone,
      sessionsTotal: pkgInfo.sessionsTotal,
      endDate: pkgInfo.endDate,
      lastSessionAt: lastByClient.get(c.id as string) ?? null,
    };
  });

  return (
    <div className="rise-in-stagger space-y-6 md:space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.26em] text-[color:var(--color-moss)]">
            clients
          </p>
          <h1 className="mt-2 text-3xl md:text-4xl">Everyone you train.</h1>
          <p className="mt-1 text-sm text-[color:var(--color-stone)] tabular-nums">
            {showArchived
              ? `${archivedCount ?? 0} archived`
              : `${activeCount ?? 0} active${
                  archivedCount && archivedCount > 0 ? ` · ${archivedCount} archived` : ""
                }`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {showArchived || (archivedCount && archivedCount > 0) ? (
            <Link
              href={showArchived ? "/studio/clients" : "/studio/clients?archived=1"}
              className="inline-flex h-10 items-center gap-1.5 rounded-full border border-[color:var(--color-stone-soft)] bg-[color:var(--color-canvas)] px-4 text-sm font-medium text-[color:var(--color-ink)] hover:bg-[color:var(--color-parchment)]"
            >
              {showArchived ? (
                <>
                  active{" "}
                  <span className="tabular-nums text-[color:var(--color-stone)]">
                    {activeCount ?? 0}
                  </span>
                </>
              ) : (
                <>
                  archived{" "}
                  <span className="tabular-nums text-[color:var(--color-stone)]">
                    {archivedCount}
                  </span>
                </>
              )}
            </Link>
          ) : null}
          <Button asChild>
            <Link href="/studio/clients/new">invite a client</Link>
          </Button>
        </div>
      </header>

      <ClientsList clients={rows} showingArchived={showArchived} />
    </div>
  );
}
