import Link from "next/link";

import { PendingSubscriptions, type PendingRow } from "./pending-subscriptions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const supabase = await createSupabaseServerClient();
  const [{ count: clientCount }, { data: pendingRaw }] = await Promise.all([
    supabase.from("clients").select("*", { count: "exact", head: true }).eq("active", true),
    supabase
      .from("subscriptions")
      .select("id, created_at, clients(display_name), packages(name, price_usd)")
      .eq("payment_status", "pending")
      .order("created_at", { ascending: false })
      .limit(8),
  ]);

  const pending: PendingRow[] = (pendingRaw ?? []).map((row) => {
    const client = row.clients as { display_name?: string } | null;
    const pkg = row.packages as { name?: string; price_usd?: number } | null;
    return {
      id: row.id,
      createdAt: row.created_at,
      clientName: client?.display_name ?? "Client",
      packageName: pkg?.name ?? "Package",
      priceUsd: pkg?.price_usd ?? 0,
    };
  });

  return (
    <div className="rise-in-stagger space-y-10">
      <section>
        <p className="text-xs font-medium uppercase tracking-[0.26em] text-[color:var(--color-moss)]">overview</p>
        <h1 className="mt-2 font-display text-4xl leading-tight">Welcome to your studio.</h1>
        <p className="mt-2 max-w-xl text-[color:var(--color-ink)]/75">
          Start by inviting your first client and setting up the exercises you rely on most.
        </p>
      </section>

      <section className="grid gap-6 md:grid-cols-3">
        <Stat label="today" value="0" suffix="sessions" />
        <Stat label="this week" value="0" suffix="sessions" />
        <Stat label="active clients" value={String(clientCount ?? 0)} suffix="" />
      </section>

      {pending.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Awaiting payment</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <PendingSubscriptions rows={pending} />
          </CardContent>
        </Card>
      ) : null}

      <section className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Your first client</CardTitle>
          </CardHeader>
          <CardContent>
            <EmptyState
              title="No clients yet"
              body="Invite someone by email and they&rsquo;ll land in your studio with a personal space for sessions and tracking."
              action={
                <Button asChild>
                  <Link href="/studio/clients/new">invite a client</Link>
                </Button>
              }
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Your library</CardTitle>
          </CardHeader>
          <CardContent>
            <EmptyState
              title="No exercises yet"
              body="Add the movements you coach most often. Every session you build will draw from here."
              action={
                <Button asChild variant="secondary">
                  <Link href="/studio/library/new">add an exercise</Link>
                </Button>
              }
            />
          </CardContent>
        </Card>
      </section>
    </div>
  );
}

function Stat({ label, value, suffix }: { label: string; value: string; suffix: string }) {
  return (
    <div className="rounded-lg border border-[color:var(--color-stone-soft)]/70 bg-[color:var(--color-parchment)]/60 px-6 py-5">
      <p className="text-xs font-medium uppercase tracking-[0.18em] text-[color:var(--color-stone)]">{label}</p>
      <p className="mt-3 text-4xl tabular-nums">
        {value}
        {suffix ? <span className="ml-2 text-sm text-[color:var(--color-stone)]">{suffix}</span> : null}
      </p>
    </div>
  );
}
