import { RequestSessionButton } from "./request-button";
import { SwitchPackageNextCycle } from "./switch-package";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { requireClient } from "@/lib/trainer";

export const dynamic = "force-dynamic";

export default async function ClientDashboard({
  searchParams,
}: {
  searchParams: Promise<{ welcome?: string }>;
}) {
  const sp = await searchParams;
  const client = await requireClient();
  const admin = createSupabaseAdminClient();

  const [{ data: subs }, { data: packages }] = await Promise.all([
    admin
      .from("subscriptions")
      .select(
        "id, payment_status, sessions_remaining, start_date, end_date, package_id, pending_package_id, next_renewal_date, packages(name, session_count, price_usd)",
      )
      .eq("client_id", client.id)
      .order("created_at", { ascending: false }),
    admin
      .from("packages")
      .select("id, name, session_count, price_usd")
      .eq("tenant_id", client.tenantId)
      .eq("active", true)
      .order("price_usd"),
  ]);

  const pending = subs?.find((s) => s.payment_status === "pending");
  const active = subs?.find(
    (s) => s.payment_status === "paid" && (s.sessions_remaining ?? 0) > 0,
  );

  return (
    <div className="rise-in-stagger space-y-10">
      <section className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.26em] text-[color:var(--color-moss)]">
            overview
          </p>
          <h1 className="mt-2 text-3xl md:text-4xl">
            {sp.welcome ? "You&rsquo;re in." : "Welcome back."}
          </h1>
          <p className="mt-2 max-w-xl text-[color:var(--color-ink)]/75">
            {pending
              ? "Your trainer will confirm your payment soon. Once they do, your sessions unlock."
              : "Everything you need for your training month lives here."}
          </p>
        </div>
        <RequestSessionButton />
      </section>

      {active ? (
        <Card>
          <CardHeader>
            <CardTitle>This month</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid gap-4 sm:grid-cols-3">
              <Stat
                label="package"
                value={(active.packages as { name?: string } | { name?: string }[] | null)
                  ? (Array.isArray(active.packages) ? active.packages[0]?.name : (active.packages as { name?: string }).name) ?? "—"
                  : "—"}
              />
              <Stat label="sessions left" value={`${active.sessions_remaining}`} />
              <Stat
                label="renews"
                value={
                  active.next_renewal_date
                    ? new Date(active.next_renewal_date).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                      })
                    : "—"
                }
              />
            </div>

            <div className="border-t border-[color:var(--color-stone-soft)]/70 pt-5">
              <SwitchPackageNextCycle
                subscriptionId={active.id}
                currentPackageId={active.package_id ?? ""}
                pendingPackageId={active.pending_package_id ?? null}
                packages={(packages ?? []).map((p) => ({
                  id: p.id,
                  name: p.name,
                  session_count: p.session_count,
                  price_usd: p.price_usd,
                }))}
                nextRenewal={active.next_renewal_date}
              />
            </div>
          </CardContent>
        </Card>
      ) : pending ? (
        <Card>
          <CardHeader>
            <CardTitle>Awaiting confirmation</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-[color:var(--color-ink)]/75">
              {(Array.isArray(pending.packages) ? pending.packages[0] : (pending.packages as { name?: string } | null))?.name ?? "Your package"} —
              your trainer will mark it paid when they receive your payment, then sessions unlock.
            </p>
          </CardContent>
        </Card>
      ) : (
        <EmptyState
          bordered
          title="No active block yet"
          body="Pick a package on your trainer&rsquo;s studio page to get started."
        />
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[color:var(--color-stone)]">
        {label}
      </p>
      <p className="mt-1 text-lg font-semibold tracking-tight tabular-nums">{value}</p>
    </div>
  );
}
