import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function PackagesPage() {
  const supabase = await createSupabaseServerClient();
  const { data: packages } = await supabase
    .from("packages")
    .select("id, name, session_type_mix, session_count, duration_days, price_usd, payment_mode, cancellation_policy, active")
    .order("created_at", { ascending: false });

  return (
    <div className="rise-in-stagger space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.26em] text-[color:var(--color-moss)]">packages</p>
          <h1 className="mt-2 text-4xl">What clients buy.</h1>
        </div>
        <Button asChild>
          <Link href="/studio/packages/new">new package</Link>
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          {!packages || packages.length === 0 ? (
            <div className="p-8">
              <EmptyState
                title="No packages yet"
                body="Design a block — how many sessions, how long the validity lasts, what it costs. Clients subscribe from your public page."
                action={
                  <Button asChild>
                    <Link href="/studio/packages/new">design a package</Link>
                  </Button>
                }
              />
            </div>
          ) : (
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
                      <Link href={`/studio/packages/${p.id}`} className="hover:text-[color:var(--color-moss-deep)]">
                        {p.name}
                      </Link>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{p.session_count}</TableCell>
                    <TableCell className="text-right tabular-nums">{p.duration_days}d</TableCell>
                    <TableCell className="text-right tabular-nums">${p.price_usd.toLocaleString()}</TableCell>
                    <TableCell className="capitalize">{p.payment_mode}</TableCell>
                    <TableCell className="capitalize">{p.cancellation_policy}</TableCell>
                    <TableCell>
                      <Badge tone={p.active ? "moss" : "stone"}>{p.active ? "live" : "archived"}</Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
