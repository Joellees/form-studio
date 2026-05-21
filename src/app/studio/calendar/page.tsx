import Link from "next/link";

import { CalendarGrid } from "./_components/calendar-grid";
import { RequestsPanel, type PendingRequest } from "./_components/requests-panel";
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
    { data: requestsRaw },
  ] = await Promise.all([
    admin
      .from("sessions")
      /* Scheduled / completed / cancelled rows render in the grid.
       * `requested` and `declined` are explicitly excluded — requests
       * have a dedicated panel above the grid, and declined sessions
       * are dismissed (not scheduled, never were) so they don't
       * belong on the calendar. */
      .select("id, scheduled_at, duration_minutes, session_type, status, name, day_label, clients(display_name)")
      .eq("tenant_id", trainer.id)
      .gte("scheduled_at", start.toISOString())
      .lte("scheduled_at", end.toISOString())
      .not("status", "in", "(requested,declined)")
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
    /* Pending session requests across ALL future dates, not scoped
     * to the current view window — the trainer's mental model is
     * "show me everything waiting on me," regardless of which week
     * they're navigating. Cap at 20 so a runaway client doesn't
     * hijack the panel; in practice this is "<5". */
    admin
      .from("sessions")
      .select("id, scheduled_at, duration_minutes, notes, clients(display_name)")
      .eq("tenant_id", trainer.id)
      .eq("status", "requested")
      .order("scheduled_at", { ascending: true })
      .limit(20),
  ]);

  // Group sessions by day in trainer's timezone
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

  const now = new Date();
  const todayKey = formatInTz(now, trainer.timezone, "yyyy-MM-dd");
  const currentYearKey = formatInTz(now, trainer.timezone, "yyyy");
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

  /* Shape the raw requests query into the panel's lighter type. We
   * pull the client's display name out of the nested relation and
   * format the scheduled-at in the trainer's tz once here so the
   * client component doesn't need access to the trainer's timezone
   * (avoids passing it through props as well). */
  const requests: PendingRequest[] = (requestsRaw ?? []).map((r) => {
    const c = r.clients as { display_name?: string } | { display_name?: string }[] | null;
    const client = Array.isArray(c) ? c[0] : c;
    return {
      id: r.id as string,
      scheduledLabel: formatInTz(
        new Date(r.scheduled_at as string),
        trainer.timezone,
        "EEE, MMM d · HH:mm",
      ),
      durationMinutes: (r.duration_minutes as number) ?? 60,
      clientName: client?.display_name ?? "Client",
      clientNote: (r.notes as string | null) ?? null,
    };
  });

  // iOS-Calendar header: the primary label is the date range itself —
  // month name for month view, "Nov 18 – 24" for week / 2-weeks. The
  // year sits above as a quiet eyebrow only when it differs from the
  // current year (matches iOS's habit of hiding "2026" when you're
  // already in 2026; it reappears the moment you page into 2027).
  const titleYearKey =
    view === "month"
      ? formatInTz(monthStart ?? start, trainer.timezone, "yyyy")
      : formatInTz(start, trainer.timezone, "yyyy");
  const titleYear = titleYearKey === currentYearKey ? null : titleYearKey;
  const titleLabel =
    view === "month"
      ? formatInTz(monthStart ?? start, trainer.timezone, "MMMM")
      : sameMonth(start, end, trainer.timezone)
        ? `${formatInTz(start, trainer.timezone, "MMM d")} – ${formatInTz(end, trainer.timezone, "d")}`
        : `${formatInTz(start, trainer.timezone, "MMM d")} – ${formatInTz(end, trainer.timezone, "MMM d")}`;

  // Whether the current window already contains today — drives the
  // "today" jump-back button. Hidden when we're already on now (so
  // the default load has no extra chrome), visible the moment the
  // trainer has paged away. iOS's bottom-bar "Today" pill does the
  // same thing with persistent placement; we just hide rather than
  // dim for less visual noise.
  const todayInWindow =
    todayKey >= formatInTz(start, trainer.timezone, "yyyy-MM-dd") &&
    todayKey <= formatInTz(end, trainer.timezone, "yyyy-MM-dd");

  // prev/next anchored to the start of the current window so the
  // chevrons traverse non-overlapping ranges.
  const prevHref = navHref(view, start, "prev");
  const nextHref = navHref(view, start, "next");
  const todayHref = `?${new URLSearchParams({ view, date: todayKey }).toString()}`;

  return (
    <div className="rise-in-stagger space-y-5 md:space-y-8">
      <CalendarHeader
        titleYear={titleYear}
        titleLabel={titleLabel}
        timezoneLabel={prettyTimezone(trainer.timezone)}
        view={view}
        reference={start}
        prevHref={prevHref}
        nextHref={nextHref}
        todayHref={todayHref}
        showTodayButton={!todayInWindow}
      />

      {/* Requests live ABOVE the grid as a dedicated queue. The
        * panel auto-hides when there are zero pending requests so
        * quiet days don't waste vertical space. */}
      <RequestsPanel requests={requests} />

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

/**
 * iOS-Calendar-shaped header. Two zones:
 *
 *   left:   year eyebrow (conditional) + primary label (month OR range)
 *   right:  [today]  [week / 2wk / month]  [← →]
 *
 * The "today" pill is conditional — it only renders when the
 * current view window doesn't include today. iOS shows it in a
 * persistent spot whenever you've paged away; we hide it on the
 * default load so the chrome stays quiet, and surface it the moment
 * the trainer has navigated forward or back.
 *
 * On mobile the right cluster wraps below the title block — packing
 * a four-element control row inline at 375px collided with the date
 * label and forced the view switcher onto its own line anyway.
 * Splitting it deliberately gives the heading one row of breathing
 * space and lines the controls up across one clean tap-target row.
 */
function CalendarHeader({
  titleYear,
  titleLabel,
  timezoneLabel,
  view,
  reference,
  prevHref,
  nextHref,
  todayHref,
  showTodayButton,
}: {
  titleYear: string | null;
  titleLabel: string;
  timezoneLabel: string;
  view: View;
  reference: Date;
  prevHref: string;
  nextHref: string;
  todayHref: string;
  showTodayButton: boolean;
}) {
  return (
    <div className="space-y-3 md:flex md:flex-wrap md:items-end md:justify-between md:gap-4 md:space-y-0">
      <div>
        {titleYear ? (
          <p className="text-xs font-medium uppercase tracking-[0.26em] text-[color:var(--color-stone)] tabular-nums">
            {titleYear}
          </p>
        ) : (
          /* No year eyebrow when we're in the current year — but we
           * still want the title baseline to sit at the same height
           * as on other pages. The invisible spacer keeps "November"
           * landing on the same y-coordinate as e.g. "Everyone you
           * train." on the clients list, so flipping between sidebar
           * pages doesn't bobble the H1. */
          <p
            aria-hidden
            className="text-xs font-medium uppercase tracking-[0.26em] text-transparent select-none"
          >
            &nbsp;
          </p>
        )}
        <h1 className="mt-1 text-3xl font-semibold tracking-tight md:mt-1 md:text-4xl">
          {titleLabel}
        </h1>
        <p className="mt-1.5 text-xs text-[color:var(--color-stone)] md:text-[13px]">
          times in {timezoneLabel}
        </p>
      </div>
      <div className="flex items-center justify-between gap-3 md:justify-end">
        <div className="flex items-center gap-2">
          {showTodayButton ? (
            <Link
              href={todayHref}
              className="inline-flex h-9 items-center rounded-full border border-[color:var(--color-stone-soft)] bg-[color:var(--color-canvas)] px-3.5 text-xs font-semibold tracking-tight text-[color:var(--color-ink)] transition-colors hover:bg-[color:var(--color-parchment)]"
            >
              today
            </Link>
          ) : null}
          <ViewSwitcher current={view} reference={reference} />
        </div>
        <NavGroup prevHref={prevHref} nextHref={nextHref} />
      </div>
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

/**
 * Two date ranges share a month when their MMM tokens match in the
 * trainer's tz. Drives the compact "Nov 18 – 24" rendering versus
 * the spelt-out "Nov 28 – Dec 4" form when a range crosses a month
 * boundary.
 */
function sameMonth(start: Date, end: Date, tz: string): boolean {
  return formatInTz(start, tz, "yyyy-MM") === formatInTz(end, tz, "yyyy-MM");
}

// `reference` (not `ref`) — `ref` is a reserved React prop, JSX
// strips it from the props object before the component sees it,
// which manifested as a server-side "Cannot read properties of
// undefined (reading 'toISOString')" rendering crash.
function ViewSwitcher({ current, reference }: { current: View; reference: Date }) {
  const items: { v: View; label: string }[] = [
    { v: "week", label: "week" },
    { v: "2weeks", label: "2 wk" },
    { v: "month", label: "month" },
  ];
  const date = reference.toISOString().slice(0, 10);
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
            className={`inline-flex h-8 items-center rounded-full px-3 transition-colors ${
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
    <div className="inline-flex items-center gap-0.5">
      <Link
        href={prevHref}
        aria-label="previous"
        className="inline-flex h-9 w-9 items-center justify-center rounded-full text-[color:var(--color-ink)]/65 transition-colors hover:bg-[color:var(--color-parchment)] hover:text-[color:var(--color-ink)]"
      >
        <svg width="13" height="13" viewBox="0 0 14 14" fill="none" aria-hidden>
          <path d="M9 2L4 7l5 5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </Link>
      <Link
        href={nextHref}
        aria-label="next"
        className="inline-flex h-9 w-9 items-center justify-center rounded-full text-[color:var(--color-ink)]/65 transition-colors hover:bg-[color:var(--color-parchment)] hover:text-[color:var(--color-ink)]"
      >
        <svg width="13" height="13" viewBox="0 0 14 14" fill="none" aria-hidden>
          <path d="M5 2l5 5-5 5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </Link>
    </div>
  );
}
