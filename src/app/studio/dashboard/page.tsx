import Link from "next/link";

import { ActionFeed, type FeedItem } from "./action-feed";
import { QuickActions } from "./quick-actions";
import { TodayRail, type RailSession } from "./today-rail";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { formatInTz } from "@/lib/schedule";
import { fromZonedTime } from "date-fns-tz";
import { requireTrainer } from "@/lib/trainer";

export const dynamic = "force-dynamic";

/**
 * Trainer overview. Reframed around "what should I do right now?":
 *
 *   pulse     → one-line week snapshot (completed · cancelled · pending log)
 *   left      → action feed: payments, requests, upgrades, awaiting-log,
 *               renewals, fresh notes — every row is one click to clear
 *   right rail→ today + the rest of this week + next-up
 *   top-right → invite client, new package, share studio link
 */
export default async function DashboardPage() {
  const trainer = await requireTrainer();
  const admin = createSupabaseAdminClient();
  const tz = trainer.timezone || "UTC";

  // Trainer-local "today" midnight, expressed as the UTC instant.
  // Without `fromZonedTime` we'd be filtering against UTC midnight,
  // which silently drops sessions for any non-UTC trainer.
  const todayKey = formatInTz(new Date(), tz, "yyyy-MM-dd");
  const todayStart = fromZonedTime(`${todayKey}T00:00:00`, tz);
  const tomorrowStart = new Date(todayStart.getTime() + 86400_000);
  const sevenDaysOut = new Date(todayStart.getTime() + 7 * 86400_000);
  const fourteenBack = new Date(todayStart.getTime() - 14 * 86400_000);
  const weekStart = startOfTrainerWeek(todayStart, tz);
  const weekEnd = new Date(weekStart.getTime() + 7 * 86400_000);
  const tomorrowKey = formatInTz(tomorrowStart, tz, "yyyy-MM-dd");

  const [
    { data: pendingSubs },
    { data: requestedSessions },
    { data: upcomingRaw },
    { data: awaitingLogRaw },
    { data: renewingSubs },
    { data: noteClients },
    { data: weekRows },
    { count: clientCount },
  ] = await Promise.all([
    admin
      .from("subscriptions")
      .select(
        "id, created_at, client_id, clients(display_name), packages!subscriptions_package_id_fkey(name, price_usd)",
      )
      .eq("tenant_id", trainer.id)
      .eq("payment_status", "pending")
      .order("created_at", { ascending: false })
      .limit(8),
    admin
      .from("sessions")
      .select("id, scheduled_at, session_type, in_app_origin, clients(display_name)")
      .eq("tenant_id", trainer.id)
      .eq("status", "requested")
      .order("scheduled_at")
      .limit(8),
    // "Coming up" — today + the next 7 days, scheduled or in-app pending.
    admin
      .from("sessions")
      .select(
        "id, scheduled_at, duration_minutes, session_type, in_app_origin, status, name, notes, clients(display_name)",
      )
      .eq("tenant_id", trainer.id)
      .neq("status", "cancelled")
      .gte("scheduled_at", todayStart.toISOString())
      .lt("scheduled_at", sevenDaysOut.toISOString())
      .order("scheduled_at")
      .limit(20),
    // "Awaiting log" — sessions that were supposed to happen (scheduled,
    // past) and haven't been marked complete yet. 14-day window.
    admin
      .from("sessions")
      .select("id, scheduled_at, session_type, clients(display_name)")
      .eq("tenant_id", trainer.id)
      .eq("status", "scheduled")
      .gte("scheduled_at", fourteenBack.toISOString())
      .lt("scheduled_at", todayStart.toISOString())
      .order("scheduled_at", { ascending: false })
      .limit(8),
    admin
      .from("subscriptions")
      .select(
        "id, end_date, sessions_remaining, client_id, clients(display_name), packages!subscriptions_package_id_fkey(name)",
      )
      .eq("tenant_id", trainer.id)
      .eq("payment_status", "paid")
      .gt("sessions_remaining", 0)
      .not("end_date", "is", null)
      .lte("end_date", new Date(todayStart.getTime() + 7 * 86400_000).toISOString().slice(0, 10))
      .order("end_date")
      .limit(8),
    admin
      .from("clients")
      .select("id, display_name, note_to_trainer, updated_at")
      .eq("tenant_id", trainer.id)
      .eq("active", true)
      .not("note_to_trainer", "is", null)
      .order("updated_at", { ascending: false })
      .limit(5),
    // This week's pulse — every session in the calendar-week window,
    // status only (we just count states client-side).
    admin
      .from("sessions")
      .select("id, status, scheduled_at")
      .eq("tenant_id", trainer.id)
      .gte("scheduled_at", weekStart.toISOString())
      .lt("scheduled_at", weekEnd.toISOString()),
    admin
      .from("clients")
      .select("*", { count: "exact", head: true })
      .eq("tenant_id", trainer.id)
      .eq("active", true),
  ]);

  // ─── Weekly pulse ────────────────────────────────────────────────────
  const week = {
    total: (weekRows ?? []).length,
    completed: (weekRows ?? []).filter((r) => r.status === "completed").length,
    cancelled: (weekRows ?? []).filter((r) => r.status === "cancelled").length,
    pendingLog: (weekRows ?? []).filter(
      (r) =>
        r.status === "scheduled" &&
        new Date(r.scheduled_at as string).getTime() < todayStart.getTime(),
    ).length,
    upcoming: (weekRows ?? []).filter(
      (r) =>
        r.status !== "cancelled" &&
        new Date(r.scheduled_at as string).getTime() >= todayStart.getTime(),
    ).length,
  };

  // ─── Build the action feed ───────────────────────────────────────────
  const feed: FeedItem[] = [];

  for (const s of pendingSubs ?? []) {
    const c = s.clients as { display_name?: string } | { display_name?: string }[] | null;
    const client = Array.isArray(c) ? c[0] : c;
    const p = s.packages as { name?: string; price_usd?: number } | { name?: string; price_usd?: number }[] | null;
    const pkg = Array.isArray(p) ? p[0] : p;
    feed.push({
      kind: "pending_payment",
      subscriptionId: s.id as string,
      clientId: s.client_id as string,
      clientName: client?.display_name ?? "Client",
      packageName: pkg?.name ?? "Package",
      priceUsd: Number(pkg?.price_usd ?? 0),
      createdAt: s.created_at as string,
    });
  }

  for (const s of requestedSessions ?? []) {
    const c = s.clients as { display_name?: string } | { display_name?: string }[] | null;
    const client = Array.isArray(c) ? c[0] : c;
    // Client-requested in-app sessions ($3, no deduction) get their own
    // feed kind so the trainer sees the dollar tag — and so they never
    // get auto-deducted on approval.
    const isExtraInApp =
      s.session_type === "in_app" && s.in_app_origin === "client_requested";
    feed.push({
      kind: isExtraInApp ? "in_app_upgrade" : "session_request",
      sessionId: s.id as string,
      clientName: client?.display_name ?? "Client",
      whenLabel: formatInTz(new Date(s.scheduled_at as string), tz, "EEE MMM d · HH:mm"),
    });
  }

  for (const s of awaitingLogRaw ?? []) {
    const c = s.clients as { display_name?: string } | { display_name?: string }[] | null;
    const client = Array.isArray(c) ? c[0] : c;
    feed.push({
      kind: "awaiting_log",
      sessionId: s.id as string,
      clientName: client?.display_name ?? "Client",
      whenLabel: formatInTz(new Date(s.scheduled_at as string), tz, "EEE MMM d · HH:mm"),
    });
  }

  // Note: client-requested in-app sessions are surfaced via the
  // `requestedSessions` loop above (they always carry status='requested'
  // until the trainer approves them). The legacy notes-marker upgrade
  // path no longer exists.

  for (const s of renewingSubs ?? []) {
    const c = s.clients as { display_name?: string } | { display_name?: string }[] | null;
    const client = Array.isArray(c) ? c[0] : c;
    const p = s.packages as { name?: string } | { name?: string }[] | null;
    const pkg = Array.isArray(p) ? p[0] : p;
    const end = s.end_date ? new Date(s.end_date as string) : null;
    if (!end) continue;
    const daysLeft = Math.max(
      0,
      Math.ceil((end.getTime() - todayStart.getTime()) / 86400_000),
    );
    feed.push({
      kind: "renewal_soon",
      subscriptionId: s.id as string,
      clientId: s.client_id as string,
      clientName: client?.display_name ?? "Client",
      packageName: pkg?.name ?? "Block",
      daysLeft,
      sessionsLeft: Number(s.sessions_remaining ?? 0),
    });
  }

  for (const c of noteClients ?? []) {
    const note = (c as { note_to_trainer?: string }).note_to_trainer ?? "";
    if (!note.trim()) continue;
    feed.push({
      kind: "client_note",
      clientId: c.id as string,
      clientName: c.display_name as string,
      preview: note.length > 80 ? `${note.slice(0, 80).trim()}…` : note,
    });
  }

  // ─── Right-rail sessions ─────────────────────────────────────────────
  const rail: RailSession[] = (upcomingRaw ?? []).slice(0, 12).map((s) => {
    const c = s.clients as { display_name?: string } | { display_name?: string }[] | null;
    const client = Array.isArray(c) ? c[0] : c;
    const dayKey = formatInTz(new Date(s.scheduled_at as string), tz, "yyyy-MM-dd");
    const dayLabel =
      dayKey === todayKey
        ? "today"
        : dayKey === tomorrowKey
          ? "tomorrow"
          : formatInTz(new Date(s.scheduled_at as string), tz, "EEE, MMM d");
    return {
      id: s.id as string,
      scheduledAt: s.scheduled_at as string,
      durationMinutes: Number(s.duration_minutes ?? 60),
      clientName: client?.display_name ?? "Client",
      sessionType: s.session_type as RailSession["sessionType"],
      status: s.status as RailSession["status"],
      timeLabel: formatInTz(new Date(s.scheduled_at as string), tz, "HH:mm"),
      dayLabel,
    };
  });

  const fresh = (clientCount ?? 0) === 0;
  const studioUrl = trainer.subdomainSlug
    ? `${process.env.NEXT_PUBLIC_APP_URL ?? ""}/s/${trainer.subdomainSlug}`
    : null;

  return (
    <div className="rise-in-stagger space-y-5 md:space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.26em] text-[color:var(--color-moss)]">
            overview
          </p>
          <h1 className="mt-2 font-display text-2xl leading-tight md:text-3xl">
            Hi, {trainer.displayName.split(" ")[0]}.
          </h1>
        </div>
        <QuickActions studioUrl={studioUrl} />
      </header>

      {fresh ? (
        <FirstTimeNudges />
      ) : (
        <>
          <PulseStrip
            completed={week.completed}
            total={week.total}
            cancelled={week.cancelled}
            pendingLog={week.pendingLog}
            upcoming={week.upcoming}
          />

          <div className="grid gap-6 lg:grid-cols-[2fr_1fr] lg:gap-8">
            {/* Left: action feed */}
            <section className="space-y-3">
              <h2 className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[color:var(--color-stone)]">
                what needs you
              </h2>
              {feed.length === 0 ? (
                <div className="rounded-2xl bg-[color:var(--color-parchment)]/55 p-5">
                  <p className="text-sm text-[color:var(--color-ink)]/75">
                    Inbox zero. Nothing waiting on you.
                  </p>
                  <p className="mt-1 text-xs text-[color:var(--color-stone)]">
                    Pending payments, session requests, in-app upgrade asks, and
                    renewing-soon subscriptions show up here.
                  </p>
                </div>
              ) : (
                <div className="rounded-2xl bg-[color:var(--color-parchment)]/55 px-5 py-4">
                  <ActionFeed items={feed} />
                </div>
              )}
            </section>

            {/* Right: today + upcoming */}
            <aside className="space-y-3 lg:sticky lg:top-24 lg:h-fit">
              <h2 className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[color:var(--color-stone)]">
                coming up
              </h2>
              <TodayRail sessions={rail} />
              {rail.length > 0 ? (
                <Link
                  href="/studio/calendar"
                  className="inline-flex h-8 items-center text-xs font-semibold uppercase tracking-[0.18em] text-[color:var(--color-stone)] hover:text-[color:var(--color-moss-deep)]"
                >
                  full calendar →
                </Link>
              ) : null}
            </aside>
          </div>
        </>
      )}
    </div>
  );
}

/**
 * One-line summary of where the trainer is this week. Compresses
 * "everything that happened" into a single scannable strip — five
 * numbers max, no charts, no graphs. Hidden when the week is empty.
 */
function PulseStrip({
  completed,
  total,
  cancelled,
  pendingLog,
  upcoming,
}: {
  completed: number;
  total: number;
  cancelled: number;
  pendingLog: number;
  upcoming: number;
}) {
  if (total === 0) return null;
  return (
    <section className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-2xl bg-[color:var(--color-parchment)]/55 px-5 py-3 text-sm tabular-nums">
      <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[color:var(--color-stone)]">
        this week
      </span>
      <span>
        <span className="font-semibold">{completed}</span>
        <span className="text-[color:var(--color-ink)]/65"> of {total} complete</span>
      </span>
      {upcoming > 0 ? (
        <span className="text-[color:var(--color-ink)]/65">
          · <span className="font-semibold text-[color:var(--color-ink)]">{upcoming}</span>{" "}
          upcoming
        </span>
      ) : null}
      {pendingLog > 0 ? (
        <span className="text-[color:var(--color-sienna)]">
          · <span className="font-semibold">{pendingLog}</span> pending log
        </span>
      ) : null}
      {cancelled > 0 ? (
        <span className="text-[color:var(--color-ink)]/65">
          · <span className="font-semibold text-[color:var(--color-ink)]">{cancelled}</span>{" "}
          cancelled
        </span>
      ) : null}
    </section>
  );
}

/**
 * Snap to the start of the trainer's calendar week (Monday 00:00 in
 * their local tz). Returned as a UTC instant.
 */
function startOfTrainerWeek(todayStartUtc: Date, tz: string): Date {
  const localISO = formatInTz(todayStartUtc, tz, "yyyy-MM-dd");
  // JS getDay: 0=Sun, 1=Mon … 6=Sat. Monday-first.
  const local = new Date(`${localISO}T00:00:00Z`);
  const dayOfWeek = local.getUTCDay();
  const offset = (dayOfWeek + 6) % 7; // Mon=0, Tue=1 … Sun=6
  const mondayLocalISO = new Date(local.getTime() - offset * 86400_000)
    .toISOString()
    .slice(0, 10);
  return fromZonedTime(`${mondayLocalISO}T00:00:00`, tz);
}

function FirstTimeNudges() {
  return (
    <div className="grid gap-6 lg:grid-cols-[2fr_1fr] lg:gap-8">
      <section className="space-y-3">
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[color:var(--color-stone)]">
          what needs you
        </h2>
        <div className="space-y-3 rounded-2xl bg-[color:var(--color-parchment)]/55 p-5">
          <p className="text-sm text-[color:var(--color-ink)]/75">
            Once you&rsquo;ve invited a client, this is where you&rsquo;ll see
            payment confirmations, session requests, sessions waiting for your
            log, and in-app upgrade asks — one row, one click to act.
          </p>
          <p className="text-xs italic text-[color:var(--color-stone)]">
            example: &ldquo;Layla owes $400 for 8 sessions · strength&rdquo; with
            a one-tap &ldquo;mark paid&rdquo; button.
          </p>
          <Link
            href="/studio/clients/new"
            className="inline-flex h-9 items-center rounded-full bg-[color:var(--color-ink)] px-4 text-xs font-medium text-[color:var(--color-canvas)] hover:bg-[color:var(--color-moss-deep)]"
          >
            invite your first client
          </Link>
        </div>
      </section>

      <aside className="space-y-3">
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[color:var(--color-stone)]">
          coming up
        </h2>
        <div className="rounded-2xl bg-[color:var(--color-parchment)]/55 p-5">
          <p className="text-sm text-[color:var(--color-ink)]/75">
            Today and the rest of the week land here once sessions are on the
            books.
          </p>
          <Link
            href="/studio/calendar"
            className="mt-3 inline-flex h-8 items-center text-xs font-semibold uppercase tracking-[0.18em] text-[color:var(--color-stone)] hover:text-[color:var(--color-moss-deep)]"
          >
            open calendar →
          </Link>
        </div>
      </aside>
    </div>
  );
}
