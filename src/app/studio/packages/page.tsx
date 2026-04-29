import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
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

export default async function PackagesPage() {
  const trainer = await requireTrainer();
  const admin = createSupabaseAdminClient();
  const { data: packages } = await admin
    .from("packages")
    .select("id, name, session_type_mix, session_count, duration_days, price_usd, payment_mode, cancellation_policy, active")
    .eq("tenant_id", trainer.id)
    .order("created_at", { ascending: false });

  return (
    <div className="rise-in-stagger space-y-6 md:space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.26em] text-[color:var(--color-moss)]">
            packages
          </p>
          <h1 className="mt-2 text-3xl md:text-4xl">What clients buy.</h1>
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
            {packages.map((p) => (
              <Link
                key={p.id}
                href={`/studio/packages/${p.id}`}
                className="block rounded-2xl bg-[color:var(--color-parchment)]/60 p-5 transition-colors hover:bg-[color:var(--color-parchment)]"
              >
                <div className="flex items-start justify-between gap-3">
                  <h3 className="text-lg font-semibold tracking-tight">{p.name}</h3>
                  <Badge tone={p.active ? "moss" : "stone"}>
                    {p.active ? "live" : "archived"}
                  </Badge>
                </div>
                <div className="mt-3 grid grid-cols-3 gap-2 text-sm tabular-nums">
                  <Stat label="sessions" value={String(p.session_count)} />
                  <Stat label="window" value={`${p.duration_days}d`} />
                  <Stat label="price" value={`$${p.price_usd.toLocaleString()}`} />
                </div>
                <div className="mt-4 flex flex-wrap gap-2 text-[11px] uppercase tracking-[0.16em] text-[color:var(--color-stone)]">
                  <span>{p.payment_mode}</span>
                  <span>·</span>
                  <span>{prettyPolicy(p.cancellation_policy)}</span>
                </div>
              </Link>
            ))}
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
                    <TableHead>status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {packages.map((p) => (
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
                        ${p.price_usd.toLocaleString()}
                      </TableCell>
                      <TableCell className="capitalize">{p.payment_mode}</TableCell>
                      <TableCell>{prettyPolicy(p.cancellation_policy)}</TableCell>
                      <TableCell>
                        <Badge tone={p.active ? "moss" : "stone"}>
                          {p.active ? "live" : "archived"}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
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
