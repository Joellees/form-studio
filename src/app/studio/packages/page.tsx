import Link from "next/link";

import { AssignToClientsButton } from "./_components/assign-to-clients-button";
import { PackageRowMenu } from "./_components/package-row-menu";
import { SubscriberList } from "./_components/subscriber-list";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatPrice } from "@/lib/pricing";
import { isMissingColumnError } from "@/lib/postgrest-errors";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { requireTrainer } from "@/lib/trainer";

export const dynamic = "force-dynamic";

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
     * absent. `session_type_mix` is intentionally not selected — the
     * column still exists for back-compat but nothing on this page
     * displays it after the trainer-feedback redesign. */
    (async () => {
      const wide = await admin
        .from("packages")
        .select(
          "id, name, session_count, duration_days, price_usd, currency, payment_mode, cancellation_policy, active",
        )
        .eq("tenant_id", trainer.id)
        .order("created_at", { ascending: false });
      if (wide.error && isMissingColumnError(wide.error)) {
        return admin
          .from("packages")
          .select(
            "id, name, session_count, duration_days, price_usd, payment_mode, cancellation_policy, active",
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

  const activeCount = (packages ?? []).filter((p) => p.active).length;
  const archivedCount = (packages ?? []).length - activeCount;
  const subtitle =
    (packages ?? []).length === 0
      ? null
      : `${activeCount} live${archivedCount > 0 ? ` · ${archivedCount} archived` : ""}`;

  return (
    <div className="rise-in-stagger space-y-4 md:space-y-8">
      <PageHeader
        title="What clients buy."
        subtitle={subtitle}
        actions={
          <Button asChild>
            <Link href="/studio/packages/new">new package</Link>
          </Button>
        }
      />

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
          {/* Mobile: stacked cards. Desktop: table. The columns the
            * trainer asked for are: name · sessions · time · price
            * on the left; clients + assign + kebab on the right.
            * Payment / cancellation / status columns are dropped —
            * trainers said they don't scan the list for those, and
            * they're available on the package detail page when
            * needed. */}
          <div className="grid gap-3 md:hidden">
            {packages.map((p) => {
              const subs = subscribersByPackage.get(p.id) ?? [];
              return (
                <div
                  key={p.id}
                  className="rounded-2xl bg-[color:var(--color-canvas)] p-5 ring-1 ring-inset ring-[color:var(--color-ink)]/6 shadow-[0_1px_3px_rgba(31,30,27,0.05)]"
                >
                  <div className="flex items-start justify-between gap-3">
                    <Link
                      href={`/studio/packages/${p.id}`}
                      className="min-w-0 flex-1 hover:text-[color:var(--color-moss-deep)]"
                    >
                      <h3 className="text-lg font-semibold tracking-tight">{p.name}</h3>
                    </Link>
                    <PackageRowMenu packageId={p.id} packageName={p.name} active={p.active} />
                  </div>
                  <div className="mt-3 grid grid-cols-3 gap-2 text-sm tabular-nums">
                    <Stat label="sessions" value={String(p.session_count)} />
                    <Stat label="time" value={`${p.duration_days}d`} />
                    <Stat label="price" value={formatPrice(p.price_usd, (p as { currency?: string }).currency ?? "usd")} />
                  </div>
                  <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                    <SubscriberList subscribers={subs} />
                    <AssignToClientsButton
                      packageId={p.id}
                      packageName={p.name}
                      buttonLabel="assign"
                      buttonSize="sm"
                      buttonVariant="outline"
                    />
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
                    <TableHead className="text-right">time</TableHead>
                    <TableHead className="text-right">price</TableHead>
                    <TableHead>clients</TableHead>
                    <TableHead className="text-right">
                      <span className="sr-only">actions</span>
                    </TableHead>
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
                        <TableCell>
                          <SubscriberList subscribers={subs} />
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="inline-flex items-center gap-1">
                            <AssignToClientsButton
                              packageId={p.id}
                              packageName={p.name}
                              buttonLabel="assign"
                              buttonSize="sm"
                              buttonVariant="outline"
                            />
                            <PackageRowMenu
                              packageId={p.id}
                              packageName={p.name}
                              active={p.active}
                            />
                          </div>
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
