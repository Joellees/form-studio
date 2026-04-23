import Link from "next/link";

import { PendingSubscriptions, type PendingRow } from "./pending-subscriptions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { requireTrainer } from "@/lib/trainer";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const trainer = await requireTrainer();
  const admin = createSupabaseAdminClient();

  const [{ count: clientCount }, { data: pendingRaw }, { count: exerciseCount }] = await Promise.all([
    admin.from("clients").select("*", { count: "exact", head: true }).eq("tenant_id", trainer.id).eq("active", true),
    admin
      .from("subscriptions")
      .select("id, created_at, clients(display_name), packages(name, price_usd)")
      .eq("tenant_id", trainer.id)
      .eq("payment_status", "pending")
      .order("created_at", { ascending: false })
      .limit(8),
    admin.from("exercises").select("*", { count: "exact", head: true }).eq("tenant_id", trainer.id).eq("archived", false),
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
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        <Stat label="today" value="0" suffix="sessions" />
        <Stat label="this week" value="0" suffix="sessions" />
        <Stat label="active clients" value={String(clientCount ?? 0)} />
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

      <section className="grid gap-4 md:grid-cols-2">
        <NextStepCard
          eyebrow="your clients"
          headline={clientCount && clientCount > 0 ? "Invite another client" : "Invite your first client"}
          body="Generate a link, send it over, they sign up and land in your studio."
          cta="invite a client"
          href="/studio/clients/new"
        />
        <NextStepCard
          eyebrow="your library"
          headline={exerciseCount && exerciseCount > 0 ? "Add another exercise" : "Build your exercise library"}
          body="Every session you build will draw from here — name, cue, video, default sets."
          cta="add an exercise"
          href="/studio/library/new"
        />
      </section>
    </div>
  );
}

function Stat({ label, value, suffix }: { label: string; value: string; suffix?: string }) {
  return (
    <div className="rounded-2xl bg-[color:var(--color-parchment)]/60 px-6 py-5">
      <p className="text-xs font-medium uppercase tracking-[0.18em] text-[color:var(--color-stone)]">{label}</p>
      <p className="mt-3 text-3xl font-semibold tabular-nums tracking-tight">
        {value}
        {suffix ? <span className="ml-2 text-sm font-normal text-[color:var(--color-stone)]">{suffix}</span> : null}
      </p>
    </div>
  );
}

function NextStepCard({
  eyebrow,
  headline,
  body,
  cta,
  href,
}: {
  eyebrow: string;
  headline: string;
  body: string;
  cta: string;
  href: string;
}) {
  return (
    <div className="flex flex-col justify-between rounded-3xl bg-[color:var(--color-parchment)]/60 p-6">
      <div>
        <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-[color:var(--color-stone)]">
          {eyebrow}
        </p>
        <h3 className="mt-3 text-xl font-semibold tracking-tight">{headline}</h3>
        <p className="mt-2 max-w-md text-sm text-[color:var(--color-ink)]/70">{body}</p>
      </div>
      <div className="mt-6">
        <Button asChild>
          <Link href={href}>{cta}</Link>
        </Button>
      </div>
    </div>
  );
}
