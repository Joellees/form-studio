import Link from "next/link";
import { notFound } from "next/navigation";

import { ArchiveClientButton } from "./archive-button";
import { AssignPackageButton } from "./assign-package";
import { ClientDetailsEditor } from "./client-details-editor";
import { ClientFieldToggles } from "./client-field-toggles";
import { MarkPaidButton } from "./mark-paid-button";
import { ProgressPanel, type LogEntry } from "./progress-panel";
import { RevertPaidMenu } from "./revert-paid-menu";
import { SubscriptionEditor } from "./subscription-editor";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { prettySessionType, type SessionTypeValue } from "@/lib/session-type";
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

  const [
    { data: client },
    { data: fields },
    { data: subs },
    { data: sessions },
    { data: packages },
    { data: logs },
  ] = await Promise.all([
    admin.from("clients").select("*").eq("id", id).eq("tenant_id", trainer.id).maybeSingle(),
    admin.from("client_profile_fields").select("*").eq("client_id", id).maybeSingle(),
    admin
      .from("subscriptions")
      .select(
        "id, payment_status, payment_method, sessions_remaining, start_date, end_date, paid_confirmed_at, created_at, packages!subscriptions_package_id_fkey(name, session_count, price_usd, duration_days)",
      )
      .eq("client_id", id)
      .order("created_at", { ascending: false }),
    admin
      .from("sessions")
      .select("id, scheduled_at, duration_minutes, session_type, status, name")
      .eq("client_id", id)
      .order("scheduled_at", { ascending: false })
      .limit(20),
    admin
      .from("packages")
      .select("id, name, session_count, duration_days, price_usd")
      .eq("tenant_id", trainer.id)
      .eq("active", true)
      .order("price_usd"),
    admin
      .from("client_logs")
      .select("id, field_type, value, notes, logged_at")
      .eq("client_id", id)
      .order("logged_at", { ascending: false })
      .limit(100),
  ]);

  if (!client) notFound();

  const now = new Date();
  const upcoming = (sessions ?? []).filter((s) => new Date(s.scheduled_at) >= now && s.status !== "cancelled");
  const past = (sessions ?? []).filter((s) => new Date(s.scheduled_at) < now || s.status === "cancelled");

  const activeSub = (subs ?? []).find((s) => isActive(s));
  const pendingSub = (subs ?? []).find((s) => s.payment_status === "pending");
  const historySubs = (subs ?? []).filter((s) => s.id !== activeSub?.id && s.id !== pendingSub?.id);

  // Billing snapshot — what the trainer sees at a glance
  const billing = (() => {
    if (pendingSub) {
      const price = pkgOf(pendingSub.packages)?.price_usd ?? 0;
      return { tone: "signal" as const, text: `awaiting $${price.toLocaleString()}` };
    }
    if (activeSub) {
      return {
        tone: "moss" as const,
        text: activeSub.end_date ? `paid · through ${fmt(activeSub.end_date)}` : "paid",
      };
    }
    return null;
  })();

  const contactLine =
    [client.email, client.phone].filter(Boolean).join(" · ") || "no contact info";
  const note = (client as { note_to_trainer?: string | null }).note_to_trainer ?? null;

  return (
    <div className="rise-in-stagger space-y-8 md:space-y-10">
      <PageHeader
        eyebrow="client"
        title={client.display_name}
        subtitle={`${contactLine} · added ${fmt(client.created_at)}`}
        actions={
          <>
            <Button asChild>
              <Link href={`/studio/calendar/new?client=${id}`}>schedule session</Link>
            </Button>
            <ArchiveClientButton clientId={id} archived={!client.active} />
          </>
        }
      >
        {/* The active + billing badges that used to live up here are
          * gone — they were duplicated by the package card below
          * (which now carries both pieces of info explicitly). A
          * client profile header doesn't need to repeat what the
          * package card already says. */}
        {note ? (
          /* Note-to-trainer surfaces inline with the header — same
            * canvas card + moss-typography eyebrow shape used
            * everywhere else, drops the heavier border-left-2 + parchment
            * fill of the previous build. Reads as a calmer quote
            * panel that doesn't compete with the package card below. */
          <figure className="max-w-xl rounded-2xl bg-[color:var(--color-canvas)] px-4 py-3 ring-1 ring-inset ring-[color:var(--color-ink)]/6 shadow-[0_1px_3px_rgba(31,30,27,0.05)]">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[color:var(--color-moss)]">
              from {client.display_name.split(" ")[0]}
            </p>
            <blockquote className="mt-1 whitespace-pre-line text-sm text-[color:var(--color-ink)]/85">
              {note}
            </blockquote>
          </figure>
        ) : null}
      </PageHeader>

      {/* Package — the canonical card for "what block is this client
        * on right now". Carries an explicit `Package` title with the
        * active + paid tags inside the card header (instead of in the
        * page-header badge row, which was redundant). The old
        * "current block" section heading is gone — the card title
        * does that job. */}
      <section>
        {activeSub ? (
          <Card>
            <CardHeader>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <CardTitle>Package</CardTitle>
                  <Badge tone="moss">active</Badge>
                  <Badge tone="moss">
                    paid
                    {activeSub.paid_confirmed_at ? ` · ${fmt(activeSub.paid_confirmed_at)}` : ""}
                  </Badge>
                </div>
                {/* Less-prominent revert affordance for paid subs that
                    are past the 30-second undo toast window. */}
                <RevertPaidMenu subscriptionId={activeSub.id} />
              </div>
            </CardHeader>
            <CardContent className="pt-0">
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
          <Card>
            <CardHeader>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <CardTitle>Package</CardTitle>
                  <Badge tone="signal">awaiting payment</Badge>
                </div>
                <MarkPaidButton
                  subscriptionId={pendingSub.id}
                  priceLabel={
                    pkgOf(pendingSub.packages)?.price_usd
                      ? `$${pkgOf(pendingSub.packages)!.price_usd.toLocaleString()}`
                      : null
                  }
                />
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              <p className="font-medium">{pkgOf(pendingSub.packages)?.name ?? "Package"}</p>
              <p className="mt-1 text-xs text-[color:var(--color-stone)] tabular-nums">
                reserved {fmt(pendingSub.created_at)} · ${pkgOf(pendingSub.packages)?.price_usd?.toLocaleString() ?? "—"}
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="rounded-3xl border border-dashed border-[color:var(--color-stone-soft)] px-6 py-8">
            <p className="text-sm font-semibold">No active package</p>
            <p className="mt-1 mb-4 text-sm text-[color:var(--color-ink)]/70">
              This client isn&rsquo;t on a package right now.
            </p>
            <AssignPackageButton clientId={id} packages={packages ?? []} />
          </div>
        )}
      </section>

      {/* Progress snapshot — only renders when there's something to
        * say. Hidden when the trainer has no log fields enabled for
        * this client AND there are no logs yet (the empty-progress
        * card was just chrome with no signal). It comes back the
        * moment the trainer flips on a log field or the client logs
        * their first entry. */}
      {(() => {
        const anyEnabled =
          (fields?.weight ?? true) ||
          (fields?.cycle ?? false) ||
          (fields?.measurements ?? false) ||
          (fields?.progress_photos ?? false) ||
          (fields?.sleep ?? false);
        const hasLogs = (logs ?? []).length > 0;
        if (!anyEnabled && !hasLogs) return null;
        return (
          <section>
            <ProgressPanel
              logs={(logs ?? []) as LogEntry[]}
              enabled={{
                weight: fields?.weight ?? true,
                mood: fields?.mood ?? false,
                sleep: fields?.sleep ?? false,
                measurements: fields?.measurements ?? false,
                prs: fields?.prs ?? false,
              }}
            />
          </section>
        );
      })()}

      {/* Sessions — upcoming + recent. Inside a client profile the
        * client's name is already the page header, so repeating it
        * in every row is noise. These rows lead with the DATE +
        * TIME and use the workout name (if set) as a quiet
        * sub-line. The session-type label sits as faint
        * supplementary chrome on the right. */}
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
                  <ClientProfileSessionRow
                    key={s.id}
                    id={s.id}
                    scheduledAt={s.scheduled_at}
                    name={s.name}
                    sessionType={s.session_type as "in_person" | "zoom" | "in_app"}
                    tz={trainer.timezone}
                  />
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
                  <ClientProfileSessionRow
                    key={s.id}
                    id={s.id}
                    scheduledAt={s.scheduled_at}
                    name={s.name}
                    sessionType={s.session_type as "in_person" | "zoom" | "in_app"}
                    tz={trainer.timezone}
                  />
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

/**
 * Date-forward session row for the client-profile context.
 *
 * The platform's regular SessionRow leads with the client name —
 * which is the right shape for the calendar's day-card list, but
 * not here: the trainer is already inside a client profile, so
 * repeating "Joanne · session" in every row dilutes the page.
 *
 * This variant leads with the DATE (semibold tabular), shows the
 * workout name (when set) as a quiet sub-line, and tucks the
 * session-type label as faint chrome on the right. Whole row is
 * a link to the session detail.
 */
function ClientProfileSessionRow({
  id,
  scheduledAt,
  name,
  sessionType,
  tz,
}: {
  id: string;
  scheduledAt: string;
  name: string | null;
  sessionType: "in_person" | "zoom" | "in_app";
  tz: string;
}) {
  return (
    <li>
      <Link
        href={`/studio/sessions/${id}`}
        className="-mx-2 flex items-center justify-between gap-3 rounded-xl px-2 py-3 transition-colors hover:bg-[color:var(--color-parchment)]/40"
      >
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold tabular-nums text-[color:var(--color-ink)]">
            {formatInTz(new Date(scheduledAt), tz, "EEE, MMM d · HH:mm")}
          </p>
          {name ? (
            <p className="mt-0.5 truncate text-xs text-[color:var(--color-stone)]">{name}</p>
          ) : null}
        </div>
        <span className="shrink-0 text-[11px] uppercase tracking-[0.14em] text-[color:var(--color-stone)]">
          {prettySessionType(sessionType as SessionTypeValue)}
        </span>
      </Link>
    </li>
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
