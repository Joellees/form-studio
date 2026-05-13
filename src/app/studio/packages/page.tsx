import Link from "next/link";

import { SubscriberList } from "./_components/subscriber-list";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatPrice } from "@/lib/pricing";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { requireTrainer } from "@/lib/trainer";

export const dynamic = "force-dynamic";

/**
 * Map the legacy DB enum values to the simpler labels we now show
 * everywhere: "reschedule" (was "credited") and "counted session"
 * (was "lost"). Storage keeps the old values so we don't need a DDL.
 */
function prettyPolicy(p: string): string {
  if (p === "credited") return "reschedule";
  if (p === "lost") return "counted session";
  return p;
}

type SubscriberRow = {
  clientId: string;
  clientName: string;
  status: "active" | "pending" | "expired";
  sessionsRemaining: number;
};

export default async function PackagesPage() {
  const trainer = await requireTrainer();
  const admin = createSupabaseAdminClient();
  const [{ data: packages }, { data: subscriptions }] = await Promise.all([
    /* `currency` was added by migration 0011. Until that's applied
     * on prod the column doesn't exist and a select that names it
     * fails with PostgREST 42703. Two-step pattern: try the wide
     * select first, fall back to the legacy column list on missing-
     * column. Display layer then defaults to USD when the field is
     * absent. */
    (async () => {
      const wide = await admin
        .from("packages")
        .select(
          "id, name, session_type_mix, session_count, duration_days, price_usd, currency, payment_mode, cancellation_policy, active",
        )
        .eq("tenant_id", trainer.id)
        .order("created_at", { ascending: false });
      if (wide.error && wide.error.code === "42703") {
        return admin
          .from("packages")
          .select(
            "id, name, session_type_mix, session_count, duration_days, price_usd, payment_mode, cancellation_policy, active",
          )
          .eq("tenant_id", trainer.id)
          .order("created_at", { ascending: false });
      }
      return wide;
    })(),
    admin
      .from("subscriptions")
      .select("id, package_id, client_id, payment_status, sessions_remaining, end_date, clients(display_name)")
      .eq("tenant_id", trainer.id)
      .order("created_at", { ascending: false }),
  ]);

  // Group active + pending subscriptions by package_id so each row
  // can render its own subscriber dropdown without a per-row query.
  const subscribersByPackage = new Map<string, SubscriberRow[]>();
  const today = new Date().toISOString().slice(0, 10);
  for (const s of subscriptions ?? []) {
    if (!s.package_id) continue;
    const c = s.clients as { display_name?: string } | { display_name?: string }[] | null;
    const client = Array.isArray(c) ? c[0] : c;
    const expired =
      s.end_date != null && (s.end_date as string) < today;
    const status: SubscriberRow["status"] =
      s.payment_status === "pending"
        ? "pending"
        : expired || (s.sessions_remaining as number) === 0
          ? "expired"
          : "active";
    const list = subscribersByPackage.get(s.package_id as string) ?? [];
    list.push({
      clientId: s.client_id as string,
      clientName: client?.display_name ?? "Client",
      status,
      sessionsRemaining: (s.sessions_remaining as number) ?? 0,
    });
    subscribersByPackage.set(s.package_id as string, list);
  }
  // Within each package, prefer active first, then pending, then expired.
  const statusOrder: SubscriberRow["status"][] = ["active", "pending", "expired"];
  for (const list of subscribersByPackage.values()) {
    list.sort(
      (a, b) =>
        statusOrder.indexOf(a.status) - statusOrder.indexOf(b.status) ||
        a.clientName.localeCompare(b.clientName),
    );
  }

  return (
    <div className="rise-in-stagger space-y-4 md:space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.26em] text-[color:var(--color-moss)]">
            packages
          </p>
          <h1 className="mt-1 text-2xl md:mt-2 md:text-4xl">What clients buy.</h1>
        </div>
        <Button asChild>
          <Link href="/studio/packages/new">new package</Link>
        </Button>
      </div>

      {!packages || packages.length === 0 ? (
        <Card>
          <CardContent className="p-6 md:p-8">
            <EmptyState
              title="No packages yet"
              body="Set up a block — how many sessions, how long it&rsquo;s valid, what it costs. Clients subscribe from your public page."
              action={
                <Button asChild>
                  <Link href="/studio/packages/new">create a package</Link>
                </Button>
              }
            />
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Mobile: stacked cards. Desktop: table. */}
          <div className="grid gap-3 md:hidden">
            {packages.map((p) => {
              const subs = subscribersByPackage.get(p.id) ?? [];
              return (
                <div
                  key={p.id}
                  className="rounded-2xl bg-[color:var(--color-parchment)]/60 p-5"
                >
                  <Link
                    href={`/studio/packages/${p.id}`}
                    className="flex items-start justify-between gap-3 hover:text-[color:var(--color-moss-deep)]"
                  >
                    <h3 className="text-lg font-semibold tracking-tight">{p.name}</h3>
                    <Badge tone={p.active ? "moss" : "stone"}>
                      {p.active ? "live" : "archived"}
                    </Badge>
                  </Link>
                  <div className="mt-3 grid grid-cols-3 gap-2 text-sm tabular-nums">
                    <Stat label="sessions" value={String(p.session_count)} />
                    <Stat label="window" value={`${p.duration_days}d`} />
                    <Stat label="price" value={formatPrice(p.price_usd, (p as { currency?: string }).currency ?? "usd")} />
                  </div>
                  <div className="mt-4 flex flex-wrap items-center gap-2 text-[11px] uppercase tracking-[0.16em] text-[color:var(--color-stone)]">
                    <span>{p.payment_mode}</span>
                    <span>·</span>
                    <span>{prettyPolicy(p.cancellation_policy)}</span>
                    <span className="ml-auto">
                      <SubscriberList subscribers={subs} />
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          <Card className="hidden md:block">
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>name</TableHead>
                    <TableHead className="text-right">sessions</TableHead>
                    <TableHead className="text-right">window</TableHead>
                    <TableHead className="text-right">price</TableHead>
                    <TableHead>payment</TableHead>
                    <TableHead>cancellation</TableHead>
                    <TableHead>clients</TableHead>
                    <TableHead>status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {packages.map((p) => {
                    const subs = subscribersByPackage.get(p.id) ?? [];
                    return (
                      <TableRow key={p.id}>
                        <TableCell className="font-medium">
                          <Link
                            href={`/studio/packages/${p.id}`}
                            className="hover:text-[color:var(--color-moss-deep)]"
                          >
                            {p.name}
                          </Link>
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{p.session_count}</TableCell>
                        <TableCell className="text-right tabular-nums">{p.duration_days}d</TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatPrice(p.price_usd, (p as { currency?: string }).currency ?? "usd")}
                        </TableCell>
                        <TableCell className="capitalize">{p.payment_mode}</TableCell>
                        <TableCell>{prettyPolicy(p.cancellation_policy)}</TableCell>
                        <TableCell>
                          <SubscriberList subscribers={subs} />
                        </TableCell>
                        <TableCell>
                          <Badge tone={p.active ? "moss" : "stone"}>
                            {p.active ? "live" : "archived"}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[color:var(--color-stone)]">
        {label}
      </p>
      <p className="mt-0.5 font-semibold text-[color:var(--color-ink)]">{value}</p>
    </div>
  );
}
