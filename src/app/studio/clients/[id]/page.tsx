import Link from "next/link";
import { notFound } from "next/navigation";

import { ArchiveClientButton } from "./archive-button";
import { ClientDetailsEditor } from "./client-details-editor";
import { ClientFieldToggles } from "./client-field-toggles";
import { SubscriptionEditor } from "./subscription-editor";
import { SessionRow } from "../../_components/session-row";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { requireTrainer } from "@/lib/trainer";
import { formatInTz } from "@/lib/schedule";

export const dynamic = "force-dynamic";

type PackageLite = { name: string; session_count: number; price_usd: number; duration_days: number } | null;

function pkgOf(p: PackageLite | PackageLite[]): PackageLite {
  return Array.isArray(p) ? p[0] ?? null : p;
}

function fmt(d: string | Date | null | undefined): string {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function isActive(sub: { end_date: string | null; payment_status: string; sessions_remaining: number }): boolean {
  const today = new Date().toISOString().slice(0, 10);
  return (
    sub.payment_status === "paid" &&
    (sub.end_date ?? "9999-12-31") >= today &&
    sub.sessions_remaining > 0
  );
}

export default async function ClientDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const trainer = await requireTrainer();
  const admin = createSupabaseAdminClient();

  const [{ data: client }, { data: fields }, { data: subs }, { data: sessions }] = await Promise.all([
    admin.from("clients").select("*").eq("id", id).eq("tenant_id", trainer.id).maybeSingle(),
    admin.from("client_profile_fields").select("*").eq("client_id", id).maybeSingle(),
    admin
      .from("subscriptions")
      .select(
        "id, payment_status, payment_method, sessions_remaining, start_date, end_date, paid_confirmed_at, created_at, packages(name, session_count, price_usd, duration_days)",
      )
      .eq("client_id", id)
      .order("created_at", { ascending: false }),
    admin
      .from("sessions")
      .select("id, scheduled_at, duration_minutes, session_type, status, name")
      .eq("client_id", id)
      .order("scheduled_at", { ascending: false })
      .limit(20),
  ]);

  if (!client) notFound();

  const now = new Date();
  const upcoming = (sessions ?? []).filter((s) => new Date(s.scheduled_at) >= now && s.status !== "cancelled");
  const past = (sessions ?? []).filter((s) => new Date(s.scheduled_at) < now || s.status === "cancelled");

  const activeSub = (subs ?? []).find((s) => isActive(s));
  const pendingSub = (subs ?? []).find((s) => s.payment_status === "pending");
  const historySubs = (subs ?? []).filter((s) => s.id !== activeSub?.id && s.id !== pendingSub?.id);

  return (
    <div className="space-y-10 rise-in-stagger">
      <header className="flex flex-wrap items-start justify-between gap-6">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.26em] text-[color:var(--color-moss)]">client</p>
          <h1 className="mt-2 text-4xl">{client.display_name}</h1>
          <p className="mt-1 text-sm text-[color:var(--color-ink)]/70">
            {[client.email, client.phone].filter(Boolean).join(" · ") || "No contact info"}
            {" · added "}{fmt(client.created_at)}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Badge tone={client.active ? "moss" : "stone"}>{client.active ? "active" : "paused"}</Badge>
          <Button asChild size="sm">
            <Link href={`/studio/calendar/new?client=${id}`}>schedule session</Link>
          </Button>
          <ArchiveClientButton clientId={id} archived={!client.active} />
        </div>
      </header>

      {/* Current block */}
      <section>
        <h2 className="text-xs font-medium uppercase tracking-[0.26em] text-[color:var(--color-stone)]">
          current block
        </h2>
        {activeSub ? (
          <Card className="mt-3">
            <CardContent>
              <SubscriptionEditor
                sub={{
                  id: activeSub.id,
                  sessions_remaining: activeSub.sessions_remaining,
                  start_date: activeSub.start_date,
                  end_date: activeSub.end_date,
                  package_name: pkgOf(activeSub.packages)?.name ?? null,
                  package_session_count: pkgOf(activeSub.packages)?.session_count ?? null,
                }}
              />
            </CardContent>
          </Card>
        ) : pendingSub ? (
          <Card className="mt-3">
            <CardContent className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <p className="font-medium">{pkgOf(pendingSub.packages)?.name ?? "Package"}</p>
                <p className="mt-1 text-xs text-[color:var(--color-stone)] tabular-nums">
                  reserved {fmt(pendingSub.created_at)} · ${pkgOf(pendingSub.packages)?.price_usd?.toLocaleString() ?? "—"}
                </p>
              </div>
              <Badge tone="signal">awaiting payment</Badge>
            </CardContent>
          </Card>
        ) : (
          <div className="mt-3 rounded-3xl border border-dashed border-[color:var(--color-stone-soft)] px-6 py-8">
            <p className="text-sm font-semibold">No active block</p>
            <p className="mt-1 text-sm text-[color:var(--color-ink)]/70">
              This client isn&rsquo;t on a package right now.
            </p>
          </div>
        )}
      </section>

      {/* Sessions */}
      <section className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Upcoming</CardTitle>
          </CardHeader>
          <CardContent>
            {upcoming.length === 0 ? (
              <p className="text-sm text-[color:var(--color-ink)]/70">Nothing scheduled.</p>
            ) : (
              <ul className="divide-y divide-[color:var(--color-stone-soft)]/70">
                {upcoming.slice(0, 5).map((s) => (
                  <li key={s.id}>
                    <SessionRow
                      session={{
                        id: s.id,
                        scheduled_at: s.scheduled_at,
                        duration_minutes: s.duration_minutes,
                        session_type: s.session_type as "in_person" | "zoom" | "in_app",
                        status: s.status as "scheduled" | "completed" | "cancelled" | "requested" | "declined",
                        name: s.name,
                        client_name: client.display_name,
                        formatted_time: formatInTz(new Date(s.scheduled_at), trainer.timezone, "EEE, MMM d · HH:mm"),
                      }}
                    />
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recent</CardTitle>
          </CardHeader>
          <CardContent>
            {past.length === 0 ? (
              <p className="text-sm text-[color:var(--color-ink)]/70">No past sessions yet.</p>
            ) : (
              <ul className="divide-y divide-[color:var(--color-stone-soft)]/70">
                {past.slice(0, 5).map((s) => (
                  <li key={s.id}>
                    <SessionRow
                      session={{
                        id: s.id,
                        scheduled_at: s.scheduled_at,
                        duration_minutes: s.duration_minutes,
                        session_type: s.session_type as "in_person" | "zoom" | "in_app",
                        status: s.status as "scheduled" | "completed" | "cancelled" | "requested" | "declined",
                        name: s.name,
                        client_name: client.display_name,
                        formatted_time: formatInTz(new Date(s.scheduled_at), trainer.timezone, "EEE, MMM d · HH:mm"),
                      }}
                    />
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </section>

      {/* Subscription history */}
      {historySubs.length > 0 ? (
        <section>
          <Card>
            <CardHeader>
              <CardTitle>Subscription history</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="divide-y divide-[color:var(--color-stone-soft)]">
                {historySubs.map((s) => (
                  <li key={s.id} className="flex items-center justify-between py-3">
                    <div>
                      <p className="font-medium">{pkgOf(s.packages)?.name ?? "Package"}</p>
                      <p className="text-xs text-[color:var(--color-stone)] tabular-nums">
                        {fmt(s.start_date)} – {fmt(s.end_date)} · via {s.payment_method}
                      </p>
                    </div>
                    <Badge
                      tone={
                        s.payment_status === "paid"
                          ? "stone"
                          : s.payment_status === "pending"
                            ? "signal"
                            : "stone"
                      }
                    >
                      {s.payment_status === "paid" ? "expired" : s.payment_status}
                    </Badge>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </section>
      ) : null}

      <section className="grid gap-6 md:grid-cols-[2fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Details</CardTitle>
          </CardHeader>
          <CardContent>
            <ClientDetailsEditor
              client={{
                id,
                display_name: client.display_name,
                email: client.email ?? null,
                phone: client.phone ?? null,
                notes: client.notes ?? null,
                goals: (client as { goals?: string | null }).goals ?? null,
                injuries: (client as { injuries?: string | null }).injuries ?? null,
              }}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Log fields</CardTitle>
          </CardHeader>
          <CardContent>
            <ClientFieldToggles
              clientId={id}
              initial={{
                weight: fields?.weight ?? true,
                cycle: fields?.cycle ?? false,
                measurements: fields?.measurements ?? false,
                progress_photos: fields?.progress_photos ?? false,
                mood: fields?.mood ?? false,
                sleep: fields?.sleep ?? false,
                prs: fields?.prs ?? false,
              }}
            />
          </CardContent>
        </Card>
      </section>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-[color:var(--color-stone)]">
        {label}
      </p>
      <p className="mt-1 text-sm tabular-nums text-[color:var(--color-ink)]">{value}</p>
    </div>
  );
}
