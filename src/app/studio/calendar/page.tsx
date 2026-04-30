import Link from "next/link";

import { CalendarGrid } from "./_components/calendar-grid";
import { type SessionSummary } from "../_components/session-row";
import { EmptyState } from "@/components/ui/empty-state";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { requireTrainer } from "@/lib/trainer";
import { formatInTz, monthGridRange, multiWeekRange, weekRange } from "@/lib/schedule";
import { prettyTimezone } from "@/lib/timezone";

export const dynamic = "force-dynamic";

type View = "week" | "2weeks" | "month";

type Props = { searchParams: Promise<{ view?: string; date?: string; week?: string }> };

function parseView(v: string | undefined): View {
  if (v === "2weeks" || v === "month") return v;
  return "week";
}

export default async function CalendarPage({ searchParams }: Props) {
  const sp = await searchParams;
  const trainer = await requireTrainer();
  const view = parseView(sp.view);
  // `?date=` is the new param. `?week=` kept as a fallback so old
  // bookmarks still work during transition.
  const ref = sp.date ?? sp.week;
  const reference = ref ? new Date(ref) : new Date();

  const { start, end, days, monthStart, monthEnd } = (() => {
    if (view === "month") {
      const r = monthGridRange(reference, trainer.timezone);
      return { ...r };
    }
    if (view === "2weeks") {
      const r = multiWeekRange(reference, trainer.timezone, 2);
      return { ...r, monthStart: undefined, monthEnd: undefined };
    }
    const r = weekRange(reference, trainer.timezone);
    return { ...r, monthStart: undefined, monthEnd: undefined };
  })();

  const admin = createSupabaseAdminClient();
  const [
    { data: sessions },
    { data: clientRows },
    { data: workouts },
  ] = await Promise.all([
    admin
      .from("sessions")
      .select("id, scheduled_at, duration_minutes, session_type, status, name, day_label, clients(display_name)")
      .eq("tenant_id", trainer.id)
      .gte("scheduled_at", start.toISOString())
      .lte("scheduled_at", end.toISOString())
      .order("scheduled_at"),
    admin
      .from("clients")
      .select(
        "id, display_name, subscriptions(id, sessions_remaining, payment_status, packages!subscriptions_package_id_fkey(name, session_count, delivery_method))",
      )
      .eq("tenant_id", trainer.id)
      .eq("active", true)
      .order("display_name"),
    admin
      .from("session_templates")
      .select("id, name")
      .eq("tenant_id", trainer.id)
      .eq("archived", false)
      .order("name"),
  ]);

  // Group sessions by day in trainer&rsquo;s timezone
  const sessionsByDay: Record<string, SessionSummary[]> = {};
  for (const s of sessions ?? []) {
    const key = formatInTz(new Date(s.scheduled_at), trainer.timezone, "yyyy-MM-dd");
    const clientRel = s.clients as { display_name?: string } | { display_name?: string }[] | null;
    const client = Array.isArray(clientRel) ? clientRel[0] : clientRel;
    (sessionsByDay[key] ??= []).push({
      id: s.id,
      scheduled_at: s.scheduled_at,
      duration_minutes: s.duration_minutes,
      session_type: s.session_type as SessionSummary["session_type"],
      status: s.status as SessionSummary["status"],
      name: s.name,
      client_name: client?.display_name ?? null,
      formatted_time: formatInTz(new Date(s.scheduled_at), trainer.timezone, "HH:mm"),
    });
  }

  const todayKey = formatInTz(new Date(), trainer.timezone, "yyyy-MM-dd");
  const monthStartKey = monthStart
    ? formatInTz(monthStart, trainer.timezone, "yyyy-MM-dd")
    : null;
  const monthEndKey = monthEnd ? formatInTz(monthEnd, trainer.timezone, "yyyy-MM-dd") : null;
  const dayObjects = days.map((d) => {
    const key = formatInTz(d, trainer.timezone, "yyyy-MM-dd");
    return {
      key,
      weekday: formatInTz(d, trainer.timezone, "EEE"),
      dayNum: formatInTz(d, trainer.timezone, "d"),
      humanDate: formatInTz(d, trainer.timezone, "EEE, MMM d"),
      isToday: key === todayKey,
      // Whether this cell belongs to the current view's "primary" month.
      // Only meaningful for month view; in week/2weeks every cell is
      // primary so we mark them all true.
      inMonth:
        monthStartKey && monthEndKey
          ? key >= monthStartKey && key <= monthEndKey
          : true,
    };
  });

  const clients = (clientRows ?? []).map((c) => {
    const subs = (c.subscriptions ?? []) as Array<{
      id: string;
      sessions_remaining: number;
      payment_status: string;
      packages:
        | { name: string; session_count: number; delivery_method?: string }
        | { name: string; session_count: number; delivery_method?: string }[]
        | null;
    }>;
    const activeBlocks = subs
      .filter((s) => s.payment_status === "paid" && s.sessions_remaining > 0)
      .map((s) => {
        const p = Array.isArray(s.packages) ? s.packages[0] : s.packages;
        // Map package delivery_method ('online') to the session_type
        // value ('zoom') the schedule form uses. Sessions kept the
        // legacy 'zoom' value to avoid a destructive DB rename.
        const delivery = (p?.delivery_method ?? "in_person") as "in_person" | "online";
        return {
          id: s.id,
          packageName: p?.name ?? "Block",
          sessionsRemaining: s.sessions_remaining,
          sessionCount: p?.session_count ?? s.sessions_remaining,
          defaultSessionType: (delivery === "online" ? "zoom" : "in_person") as
            | "in_person"
            | "zoom",
        };
      });
    return { id: c.id, displayName: c.display_name, activeBlocks };
  });

  const headline = view === "month" ? "This month." : view === "2weeks" ? "Two weeks." : "This week.";
  const dateLabel =
    view === "month"
      ? formatInTz(monthStart ?? start, trainer.timezone, "MMMM yyyy")
      : `${formatInTz(start, trainer.timezone, "MMM d")} — ${formatInTz(end, trainer.timezone, "MMM d, yyyy")}`;

  // prev/next anchored to the start of the current window so the
  // chevrons traverse non-overlapping ranges.
  const prevHref = navHref(view, start, "prev");
  const nextHref = navHref(view, start, "next");

  return (
    <div className="rise-in-stagger space-y-6 md:space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.26em] text-[color:var(--color-moss)]">
            calendar
          </p>
          <h1 className="mt-2 text-3xl md:text-4xl">{headline}</h1>
          <p className="mt-1 text-sm text-[color:var(--color-stone)] tabular-nums">
            {dateLabel} · {prettyTimezone(trainer.timezone)}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <ViewSwitcher current={view} ref={start} />
          <NavGroup prevHref={prevHref} nextHref={nextHref} />
        </div>
      </div>

      <CalendarGrid
        days={dayObjects}
        sessionsByDay={sessionsByDay}
        clients={clients}
        workouts={workouts ?? []}
        view={view}
      />

      {clients.length === 0 && (!sessions || sessions.length === 0) ? (
        <EmptyState
          bordered
          title="No clients yet"
          body="Add a client first so you have someone to schedule."
        />
      ) : null}
    </div>
  );
}

function navHref(view: View, windowStart: Date, dir: "prev" | "next"): string {
  const ms = windowStart.getTime();
  const step =
    view === "month"
      ? // Jump to the 15th of next/prev month so monthGridRange picks
        // a clean adjacent month regardless of length.
        dir === "next"
          ? addMonths(windowStart, 1)
          : addMonths(windowStart, -1)
      : view === "2weeks"
        ? new Date(ms + (dir === "next" ? 14 : -14) * 86400_000)
        : new Date(ms + (dir === "next" ? 7 : -7) * 86400_000);
  const date = step.toISOString().slice(0, 10);
  const params = new URLSearchParams({ view, date });
  return `?${params.toString()}`;
}

function addMonths(d: Date, n: number): Date {
  const next = new Date(d);
  next.setMonth(next.getMonth() + n);
  // Land on the 15th to avoid the "Feb 30" wrap-around that happens
  // when the source day-of-month doesn't exist in the target month.
  next.setDate(15);
  return next;
}

function ViewSwitcher({ current, ref }: { current: View; ref: Date }) {
  const items: { v: View; label: string }[] = [
    { v: "week", label: "week" },
    { v: "2weeks", label: "2 weeks" },
    { v: "month", label: "month" },
  ];
  const date = ref.toISOString().slice(0, 10);
  return (
    <div
      role="tablist"
      className="inline-flex items-center gap-0.5 rounded-full bg-[color:var(--color-parchment)] p-0.5 text-xs font-medium"
    >
      {items.map((item) => {
        const active = current === item.v;
        const params = new URLSearchParams({ view: item.v, date });
        return (
          <Link
            key={item.v}
            href={`?${params.toString()}`}
            role="tab"
            aria-selected={active}
            className={`rounded-full px-3 py-1.5 transition-colors ${
              active
                ? "bg-[color:var(--color-ink)] text-[color:var(--color-canvas)]"
                : "text-[color:var(--color-ink)]/65 hover:text-[color:var(--color-ink)]"
            }`}
          >
            {item.label}
          </Link>
        );
      })}
    </div>
  );
}

function NavGroup({ prevHref, nextHref }: { prevHref: string; nextHref: string }) {
  return (
    <div className="inline-flex items-center gap-1">
      <Link
        href={prevHref}
        aria-label="previous"
        className="inline-flex h-9 w-9 items-center justify-center rounded-full text-[color:var(--color-ink)]/70 hover:bg-[color:var(--color-parchment)]"
      >
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
          <path d="M9 2L4 7l5 5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </Link>
      <Link
        href={nextHref}
        aria-label="next"
        className="inline-flex h-9 w-9 items-center justify-center rounded-full text-[color:var(--color-ink)]/70 hover:bg-[color:var(--color-parchment)]"
      >
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
          <path d="M5 2l5 5-5 5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </Link>
    </div>
  );
}
