"use client";

import { formatInTimeZone } from "date-fns-tz";
import { useEffect, useMemo, useRef, useState } from "react";

import { QuickSchedule, type ClientOpt } from "./quick-schedule";
import { SessionRow, type SessionSummary } from "../../_components/session-row";
import { cn } from "@/lib/utils";

type Day = {
  key: string;
  weekday: string;
  dayNum: string;
  humanDate: string;
  isToday: boolean;
  inMonth: boolean;
};

type Props = {
  days: Day[];
  sessionsByDay: Record<string, SessionSummary[]>;
  clients: ClientOpt[];
  workouts: { id: string; name: string }[];
  view: "week" | "2weeks" | "month";
  /** Trainer's IANA timezone — used for "now" math and the
   * local→UTC conversion in QuickSchedule. */
  timezone: string;
};

/* ─── Quick-schedule launch shape ─────────────────────────────────
 *
 * The day-timeline lets the trainer tap a specific empty hour, so the
 * pick now needs to carry an optional HH:mm — quick-schedule pre-fills
 * the time field from it. When the user taps "+ add" without choosing
 * a slot we leave initialTime undefined and quick-schedule falls back
 * to 09:00.
 */
type Pick = { day: Day; initialTime?: string };

/**
 * Three layouts, picked by viewport × view. The chrome is deliberately
 * thin everywhere — iOS Calendar treats the canvas itself as the
 * surface and lets the numbers + events do the work — but day cells
 * carry a soft parchment base so they remain legible as cards rather
 * than disappearing into the page.
 *
 *  - **Mobile + week** — vertical day list. 7 days fit comfortably as
 *    full-width rows; empty days collapse to a one-line entry.
 *  - **Mobile + 2 weeks / month** — iOS mini-grid. Numbers float on
 *    canvas; tapping a day expands a `DayTimeline` below so the
 *    trainer can see existing sessions slotted into hours and tap an
 *    empty hour to schedule.
 *  - **Desktop (md+)** — 7-column grid for week/2-weeks, calendar
 *    grid for month. Month cell tap opens a centered modal with the
 *    `DayTimeline` so the booking UX matches mobile.
 */
export function CalendarGrid({ days, sessionsByDay, clients, workouts, view, timezone }: Props) {
  const [picked, setPicked] = useState<Pick | null>(null);
  /* The desktop month timeline modal is separate from the
   * quick-schedule sheet: tapping a cell opens the timeline,
   * tapping an empty hour inside the timeline THEN opens
   * quick-schedule. On mobile mini-grid the timeline is inline
   * below the grid so it doesn't need its own modal state. */
  const [timelineDay, setTimelineDay] = useState<Day | null>(null);
  const isMiniGridView = view === "2weeks" || view === "month";

  function openQuickSchedule(day: Day, initialTime?: string) {
    setPicked({ day, initialTime });
  }

  return (
    <>
      {/* Mobile */}
      <div className="md:hidden">
        {isMiniGridView ? (
          <MobileMiniGridView
            days={days}
            sessionsByDay={sessionsByDay}
            view={view}
            onAdd={(day, time) => openQuickSchedule(day, time)}
          />
        ) : (
          <MobileDayList
            days={days}
            sessionsByDay={sessionsByDay}
            onPick={(day) => openQuickSchedule(day)}
          />
        )}
      </div>

      {/* Desktop
        * - week    → time-grid (Google-Calendar-style: hour gutter
        *             on the left, 7 day columns, sessions as
        *             positioned blocks). Clicking an empty slot
        *             opens quick-schedule with the time inferred
        *             from the y-offset, rounded to the nearest 30m.
        * - 2-weeks → cell grid (the same layout as month view, just
        *             two rows). Two weeks of time-grid would either
        *             be 1000px+ tall and crowded, or compressed to
        *             unreadability — the cell view stays scannable.
        * - month   → cell grid with event chips.
        */}
      {view === "week" ? (
        <DesktopWeekTimeGrid
          days={days}
          sessionsByDay={sessionsByDay}
          timezone={timezone}
          onPick={(d) => setTimelineDay(d)}
          onAddAtTime={(d, time) => openQuickSchedule(d, time)}
        />
      ) : (
        <DesktopMonthView
          days={days}
          sessionsByDay={sessionsByDay}
          onPick={(d) => setTimelineDay(d)}
        />
      )}

      {timelineDay ? (
        <DesktopDayModal
          day={timelineDay}
          sessions={sessionsByDay[timelineDay.key] ?? []}
          onClose={() => setTimelineDay(null)}
          onAddAtTime={(time) => {
            const day = timelineDay;
            setTimelineDay(null);
            openQuickSchedule(day, time);
          }}
          onAdd={() => {
            const day = timelineDay;
            setTimelineDay(null);
            openQuickSchedule(day);
          }}
        />
      ) : null}

      {picked ? (
        <QuickSchedule
          isoDate={picked.day.key}
          dayLabel={picked.day.humanDate}
          clients={clients}
          workouts={workouts}
          initialTime={picked.initialTime}
          timezone={timezone}
          onClose={() => setPicked(null)}
        />
      ) : null}
    </>
  );
}

/* ─── Today / Selected day indicator ──────────────────────────────
 *
 * The single source of truth for "what does a date number look like?".
 * Mirrors iOS Calendar's universal pattern: today wears a filled
 * colored circle, selected days a filled neutral circle, today wins
 * if both apply. We use moss instead of iOS's red — sienna would
 * read as a warning in our palette, moss is the brand's signal of
 * growth + now and harmonises with the canvas/parchment ground.
 *
 * Three sizes — `xs` for the dense mini-grid, `sm` for inline use
 * inside larger cells (month grid, week column header), `md` for
 * the mobile day-list row.
 */
function DateBadge({
  dayNum,
  isToday,
  isSelected = false,
  isMuted = false,
  size = "sm",
}: {
  dayNum: string;
  isToday: boolean;
  isSelected?: boolean;
  isMuted?: boolean;
  size?: "xs" | "sm" | "md";
}) {
  const sizing = {
    xs: "h-8 w-8 text-[13px]",
    sm: "h-7 w-7 text-sm",
    md: "h-9 w-9 text-base",
  }[size];

  // Today takes priority over selected — matches iOS's "today never
  // loses its identity" semantics. Selected non-today gets the ink
  // fill so the trainer's tap is acknowledged without hiding today.
  const skin = isToday
    ? "bg-[color:var(--color-moss)] font-semibold text-[color:var(--color-canvas)]"
    : isSelected
      ? "bg-[color:var(--color-ink)] font-semibold text-[color:var(--color-canvas)]"
      : isMuted
        ? "text-[color:var(--color-ink)]/30"
        : "text-[color:var(--color-ink)]/85";

  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full tabular-nums tracking-tight transition-colors",
        sizing,
        skin,
      )}
    >
      {dayNum}
    </span>
  );
}

/**
 * Dots row under a day number in the mini-grid. Up to three moss
 * dots — iOS caps at three too, after which the cap stays at three
 * regardless of event count. The colour stays consistent across
 * today / non-today / selected (no awkward color flip on tap).
 */
function EventDots({ count }: { count: number }) {
  if (count <= 0) return null;
  const visible = Math.min(count, 3);
  return (
    <span aria-hidden className="absolute -bottom-1.5 flex items-center gap-[3px]">
      {Array.from({ length: visible }).map((_, i) => (
        <span
          key={i}
          className="size-1 rounded-full bg-[color:var(--color-moss)]/70"
        />
      ))}
    </span>
  );
}

/* ─── Day Timeline ────────────────────────────────────────────────
 *
 * The booking UX: tap a day → see its sequence as a vertical hour
 * column → tap an empty hour to book at that exact time. Existing
 * sessions render as positioned blocks spanning their real time so
 * the trainer can SEE where the gaps are, instead of guessing from
 * a flat list.
 *
 * Modeled after iOS Calendar's day view + Google Calendar's day
 * column. Time gutter on the left, single column on the right with
 * hour gridlines. Sessions are absolutely positioned by minutes
 * from the start of the visible range; empty hour rows are buttons
 * so the entire hour band is tappable for "+ add at 14:00".
 *
 * Range: 6 AM → 11 PM (17 hours, 1 row per hour). Covers a normal
 * training day with margin; sessions outside that range (rare,
 * usually pre-dawn or late evening) get clipped to the band's edge
 * with their full time still visible in the block label.
 */
const TIMELINE_START_HOUR = 6;
const TIMELINE_END_HOUR = 23; // exclusive — rows go 6, 7, …, 22
const HOUR_ROW_HEIGHT_PX = 52;

function DayTimeline({
  day,
  sessions,
  onAddAtTime,
  variant = "inline",
}: {
  day: Day;
  sessions: SessionSummary[];
  /** Called with HH:mm when the trainer taps an empty hour. */
  onAddAtTime: (time: string) => void;
  /**
   * `inline` (mobile mini-grid detail) gets a slightly tighter
   * surround; `modal` (desktop month) leaves the chrome to its
   * containing dialog.
   */
  variant?: "inline" | "modal";
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const hours = useMemo(
    () =>
      Array.from(
        { length: TIMELINE_END_HOUR - TIMELINE_START_HOUR },
        (_, i) => TIMELINE_START_HOUR + i,
      ),
    [],
  );

  /* Map each session to an absolute top-offset + height. The session's
   * `scheduled_at` is a UTC ISO string; we already format it on the
   * server to the trainer's HH:mm in `formatted_time`, so the hour +
   * minute math here just parses that string. Cancelled / completed
   * sessions still render but with reduced opacity so they don't
   * compete with the live schedule. */
  const blocks = useMemo(() => {
    return sessions
      .map((s) => {
        const [hStr = "0", mStr = "0"] = s.formatted_time.split(":");
        const hour = Number(hStr);
        const minute = Number(mStr);
        const startMin = hour * 60 + minute - TIMELINE_START_HOUR * 60;
        const visibleEndMin = (TIMELINE_END_HOUR - TIMELINE_START_HOUR) * 60;
        const clippedStart = Math.max(0, Math.min(startMin, visibleEndMin));
        const rawEnd = startMin + (s.duration_minutes || 60);
        const clippedEnd = Math.max(clippedStart + 24, Math.min(rawEnd, visibleEndMin));
        const top = (clippedStart / 60) * HOUR_ROW_HEIGHT_PX;
        const height = ((clippedEnd - clippedStart) / 60) * HOUR_ROW_HEIGHT_PX;
        return { session: s, top, height };
      })
      .sort((a, b) => a.top - b.top);
  }, [sessions]);

  /* Auto-scroll to the most-relevant hour on open: the first session
   * of the day if one exists, otherwise the current hour if today,
   * otherwise 8 AM. Scroll happens on mount only — subsequent prop
   * changes keep the trainer's scroll position. */
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const firstSession = blocks[0];
    let targetHour: number;
    if (firstSession) {
      targetHour = Math.floor(firstSession.top / HOUR_ROW_HEIGHT_PX) + TIMELINE_START_HOUR;
    } else if (day.isToday) {
      targetHour = new Date().getHours();
    } else {
      targetHour = 8;
    }
    const clamped = Math.max(TIMELINE_START_HOUR, Math.min(targetHour, TIMELINE_END_HOUR - 1));
    const top = (clamped - TIMELINE_START_HOUR - 1) * HOUR_ROW_HEIGHT_PX;
    el.scrollTop = Math.max(0, top);
    // Mount-only: deliberately don't depend on blocks so the user's
    // own scroll persists across re-renders triggered by data refresh.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      ref={containerRef}
      className={cn(
        "relative overflow-y-auto",
        variant === "inline"
          ? "max-h-[420px] rounded-2xl bg-[color:var(--color-canvas)] ring-1 ring-[color:var(--color-stone-soft)]/60"
          : "max-h-[60vh]",
      )}
    >
      <div className="relative" style={{ height: hours.length * HOUR_ROW_HEIGHT_PX }}>
        {/* Hour grid — each row is a tap target for "+ add at H:00". */}
        {hours.map((h) => (
          <button
            key={h}
            type="button"
            onClick={() => onAddAtTime(`${String(h).padStart(2, "0")}:00`)}
            className="group absolute left-0 right-0 flex border-t border-[color:var(--color-stone-soft)]/45 text-left transition-colors hover:bg-[color:var(--color-parchment)]/40"
            style={{ top: (h - TIMELINE_START_HOUR) * HOUR_ROW_HEIGHT_PX, height: HOUR_ROW_HEIGHT_PX }}
            aria-label={`add session at ${String(h).padStart(2, "0")}:00`}
          >
            <span className="w-12 shrink-0 pr-2 pt-1 text-right text-[10px] font-semibold uppercase tracking-[0.14em] text-[color:var(--color-stone)] tabular-nums md:w-14">
              {formatHourLabel(h)}
            </span>
            <span
              aria-hidden
              className="ml-auto self-center pr-3 text-[11px] font-medium text-[color:var(--color-stone)] opacity-0 transition-opacity group-hover:opacity-100"
            >
              + tap to add
            </span>
          </button>
        ))}

        {/* Session blocks, positioned absolutely over the grid. Sit
          * inside the right column (offset by the gutter width) so
          * they don't overlap the hour labels. */}
        <div className="pointer-events-none absolute inset-y-0 left-12 right-0 md:left-14">
          {blocks.map(({ session, top, height }) => (
            <TimelineSessionBlock
              key={session.id}
              session={session}
              top={top}
              height={height}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function formatHourLabel(hour: number): string {
  // 24-hour. Single digit looks cleaner than zero-padded ("9" vs
  // "09:00") at the time gutter — matches iOS Calendar's habit of
  // showing the hour and dropping the leading zero in the gutter.
  if (hour === 0) return "0";
  return String(hour);
}

function TimelineSessionBlock({
  session,
  top,
  height,
}: {
  session: SessionSummary;
  top: number;
  height: number;
}) {
  const cancelled = session.status === "cancelled";
  const completed = session.status === "completed";
  const label = session.client_name ?? session.name ?? "session";
  return (
    <a
      href={`/studio/sessions/${session.id}`}
      // The block lives inside a pointer-events-none container so the
      // hour grid stays tappable everywhere except behind a session;
      // re-enable pointer events on the block itself. Same canvas
      // card + moss-typography treatment as the week grid block —
      // keeps the timeline (mobile inline + desktop modal) visually
      // consistent with the week view.
      className={cn(
        "pointer-events-auto absolute left-1.5 right-2 flex flex-col gap-0.5 overflow-hidden rounded-lg bg-[color:var(--color-canvas)] px-2 py-1 text-[11px] leading-tight ring-1 ring-inset ring-[color:var(--color-ink)]/6 shadow-[0_1px_3px_rgba(31,30,27,0.06)] transition-all hover:ring-[color:var(--color-ink)]/12 hover:shadow-[0_4px_14px_-3px_rgba(31,30,27,0.18)]",
        cancelled && "line-through opacity-50",
        completed && "opacity-75",
      )}
      style={{ top, height: Math.max(height, 28) }}
    >
      <span className="tabular-nums text-[10px] font-semibold text-[color:var(--color-moss)]">
        {session.formatted_time}
      </span>
      <span className="truncate text-[color:var(--color-ink)]/85">{label}</span>
    </a>
  );
}

/* ─── Mobile: vertical week list ─────────────────────────────────── */

/**
 * iOS Calendar's mobile "list" mode: each day is a row, empty days
 * collapse to a thin header line, days with sessions expand to show
 * a stacked list of cards. The row carries a quiet parchment base so
 * it reads as a card rather than disappearing into the canvas.
 */
function MobileDayList({
  days,
  sessionsByDay,
  onPick,
}: {
  days: Day[];
  sessionsByDay: Record<string, SessionSummary[]>;
  onPick: (d: Day) => void;
}) {
  return (
    <ul className="flex flex-col gap-2">
      {days.map((d) => {
        const sessions = sessionsByDay[d.key] ?? [];
        const isEmpty = sessions.length === 0;
        return (
          <li key={d.key}>
            <div
              className={cn(
                "rounded-2xl bg-[color:var(--color-parchment)]/35 transition-colors",
                d.isToday && "bg-[color:var(--color-parchment)]/60",
              )}
            >
              <button
                type="button"
                onClick={() => onPick(d)}
                className="group flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left transition-colors hover:bg-[color:var(--color-parchment)]/55"
                aria-label={`add session on ${d.humanDate}`}
              >
                <span className="flex flex-col items-center gap-0.5">
                  <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[color:var(--color-stone)]">
                    {d.weekday}
                  </span>
                  <DateBadge dayNum={d.dayNum} isToday={d.isToday} size="md" />
                </span>
                <span className="min-w-0 flex-1">
                  {isEmpty ? (
                    <span className="text-sm text-[color:var(--color-ink)]/45">
                      no sessions
                    </span>
                  ) : (
                    <span className="text-xs font-semibold uppercase tracking-[0.16em] text-[color:var(--color-stone)]">
                      {sessions.length} session{sessions.length === 1 ? "" : "s"}
                    </span>
                  )}
                </span>
                <span
                  aria-hidden
                  className="inline-flex h-8 w-8 items-center justify-center rounded-full text-[color:var(--color-ink)]/45 transition-colors group-hover:bg-[color:var(--color-ink)] group-hover:text-[color:var(--color-canvas)]"
                >
                  <PlusIcon />
                </span>
              </button>
              {sessions.length > 0 ? (
                <ul className="flex flex-col gap-1.5 px-3 pb-3 pl-[64px]">
                  {sessions.map((s) => (
                    <li key={s.id}>
                      <SessionRow session={s} variant="card" />
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

/* ─── Mobile: mini-grid + day-timeline detail (2 weeks / month) ──── */

function MobileMiniGridView({
  days,
  sessionsByDay,
  view,
  onAdd,
}: {
  days: Day[];
  sessionsByDay: Record<string, SessionSummary[]>;
  view: "2weeks" | "month";
  onAdd: (day: Day, initialTime?: string) => void;
}) {
  const defaultKey =
    days.find((d) => d.isToday)?.key ??
    days.find((d) => d.inMonth)?.key ??
    days[0]?.key ??
    "";
  const [selectedKey, setSelectedKey] = useState(defaultKey);

  // Re-anchor selection when the days window changes (prev/next nav,
  // view switch). Without this the previous selectedKey would stick
  // to a date that's no longer in the grid.
  useEffect(() => {
    if (!days.some((d) => d.key === selectedKey)) {
      setSelectedKey(defaultKey);
    }
  }, [days, defaultKey, selectedKey]);

  const selected = days.find((d) => d.key === selectedKey) ?? days[0];

  return (
    <div className="space-y-5">
      <div>
        <div className="grid grid-cols-7 px-1 pb-2">
          {["M", "T", "W", "T", "F", "S", "S"].map((l, i) => (
            <div
              key={i}
              className="text-center text-[10px] font-semibold uppercase tracking-[0.18em] text-[color:var(--color-stone)]"
            >
              {l}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-y-2">
          {days.map((d) => (
            <MiniGridCell
              key={d.key}
              day={d}
              hasSessions={(sessionsByDay[d.key] ?? []).length > 0}
              sessionCount={(sessionsByDay[d.key] ?? []).length}
              isSelected={d.key === selectedKey}
              showOutOfMonthMute={view === "month"}
              onSelect={() => setSelectedKey(d.key)}
            />
          ))}
        </div>
      </div>

      {selected ? (
        <MiniGridDetail
          day={selected}
          sessions={sessionsByDay[selected.key] ?? []}
          onAddAtTime={(time) => onAdd(selected, time)}
          onAdd={() => onAdd(selected)}
        />
      ) : null}
    </div>
  );
}

function MiniGridCell({
  day,
  hasSessions,
  sessionCount,
  isSelected,
  showOutOfMonthMute,
  onSelect,
}: {
  day: Day;
  hasSessions: boolean;
  sessionCount: number;
  isSelected: boolean;
  showOutOfMonthMute: boolean;
  onSelect: () => void;
}) {
  const muted = showOutOfMonthMute && !day.inMonth;
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-label={day.humanDate}
      aria-pressed={isSelected}
      className="relative flex h-11 items-center justify-center"
    >
      <DateBadge
        dayNum={day.dayNum}
        isToday={day.isToday}
        isSelected={isSelected && !day.isToday}
        isMuted={muted && !isSelected}
        size="xs"
      />
      {hasSessions ? <EventDots count={sessionCount} /> : null}
    </button>
  );
}

function MiniGridDetail({
  day,
  sessions,
  onAddAtTime,
  onAdd,
}: {
  day: Day;
  sessions: SessionSummary[];
  onAddAtTime: (time: string) => void;
  onAdd: () => void;
}) {
  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[color:var(--color-stone)]">
          {day.humanDate}
          {day.isToday ? (
            <span className="ml-2 text-[color:var(--color-moss-deep)]">today</span>
          ) : null}
        </p>
        <button
          type="button"
          onClick={onAdd}
          className="inline-flex h-9 items-center gap-1.5 rounded-full bg-[color:var(--color-ink)] px-3.5 text-xs font-medium text-[color:var(--color-canvas)] hover:bg-[color:var(--color-moss-deep)]"
          aria-label={`add session on ${day.humanDate}`}
        >
          <PlusIcon />
          add
        </button>
      </div>
      <DayTimeline
        day={day}
        sessions={sessions}
        onAddAtTime={onAddAtTime}
        variant="inline"
      />
    </section>
  );
}

/* ─── Desktop: week time-grid ──────────────────────────────────── */

/**
 * Google-Calendar-style week view.
 *
 * Layout is a `[hour-gutter | 7 day columns]` grid, each column a
 * fixed-height vertical track with thin hour gridlines. Sessions
 * render as absolutely-positioned blocks placed by minutes from the
 * start of the visible range (6 AM). Today's column carries a soft
 * parchment tint and a moss "now" line that updates each minute.
 *
 * Click any empty area of a column → quick-schedule opens with the
 * time computed from the y-offset, snapped to the nearest 30
 * minutes. Click a session block → goes to that session's detail
 * page. Click the weekday header in the top row → opens the day
 * timeline modal for that date (the iOS-style alternative entry
 * point).
 *
 * Hour range: 6 AM → 11 PM (17 hours × 60px = 1020px). Wider than
 * the typical training day but tight enough to fit a desktop view
 * without scrolling the body. Sessions outside the range clip to
 * the visible edge with their full time still in the label.
 */
const GRID_START_HOUR = 6;
const GRID_END_HOUR = 23;
const GRID_HOUR_PX = 60;
const GRID_HOURS = GRID_END_HOUR - GRID_START_HOUR;
const GRID_HEIGHT = GRID_HOURS * GRID_HOUR_PX;

function DesktopWeekTimeGrid({
  days,
  sessionsByDay,
  timezone,
  onPick,
  onAddAtTime,
}: {
  days: Day[];
  sessionsByDay: Record<string, SessionSummary[]>;
  timezone: string;
  /** Click the day header → open the day timeline modal. */
  onPick: (d: Day) => void;
  /** Click an empty slot in a column → schedule at that time. */
  onAddAtTime: (d: Day, time: string) => void;
}) {
  const hours = useMemo(
    () =>
      Array.from({ length: GRID_HOURS }, (_, i) => GRID_START_HOUR + i),
    [],
  );

  /* The visible window may or may not include today. The
   * current-time line only renders when it does; this index tells
   * the line which day-column to anchor its dot at. */
  const todayIdx = days.findIndex((d) => d.isToday);

  return (
    <div className="hidden md:block">
      {/* Day-header row. Stays in the document flow rather than
        * being sticky — the studio chrome above is already sticky,
        * and a second sticky layer made the day strip drift behind
        * a 1px line. The weekday + date stack vertically (iOS Week
        * view shape) so the date number can carry the moss circle
        * without competing horizontally with the eyebrow. */}
      <div className="grid grid-cols-[48px_repeat(7,minmax(0,1fr))] border-b border-[color:var(--color-stone-soft)]/40">
        <div />
        {days.map((d) => (
          <button
            key={d.key}
            type="button"
            onClick={() => onPick(d)}
            className="flex flex-col items-center gap-1 py-2.5 transition-colors hover:bg-[color:var(--color-parchment)]/35"
            aria-label={`open ${d.humanDate}`}
          >
            <span className="text-[10px] font-medium uppercase tracking-[0.18em] text-[color:var(--color-stone)]">
              {d.weekday}
            </span>
            <DateBadge dayNum={d.dayNum} isToday={d.isToday} size="sm" />
          </button>
        ))}
      </div>

      {/* Time grid body. Hour gutter on the left + 7 day tracks.
        * Position relative so the across-week current-time line
        * can absolutely-position itself against the body. */}
      <div className="relative grid grid-cols-[48px_repeat(7,minmax(0,1fr))]">
        {/* Hour gutter — labels sit at the start of each row,
          * tabular-nums for clean vertical alignment, stone/70 so
          * they recede behind the actual data. We render every
          * hour 06 → 22; the gutter is its own column so the
          * labels don't collide with the day tracks. */}
        <div className="relative" style={{ height: GRID_HEIGHT }}>
          {hours.map((h) => (
            <div
              key={h}
              className="absolute right-0 pr-2 text-[11px] tabular-nums text-[color:var(--color-stone)]/70"
              style={{ top: (h - GRID_START_HOUR) * GRID_HOUR_PX + 4 }}
            >
              {String(h).padStart(2, "0")}
            </div>
          ))}
        </div>

        {days.map((d) => (
          <WeekGridColumn
            key={d.key}
            day={d}
            sessions={sessionsByDay[d.key] ?? []}
            onAddAtTime={(time) => onAddAtTime(d, time)}
            onOpenDay={() => onPick(d)}
          />
        ))}

        {/* Current-time line — spans all 7 columns, anchored with
          * a moss dot at today's column. Lives at the grid-body
          * level so it can cross column boundaries (vs the older
          * per-column variant that clipped to a single track).
          * Hidden when today is outside the visible window. */}
        {todayIdx >= 0 ? (
          <CurrentTimeLine timezone={timezone} todayIdx={todayIdx} />
        ) : null}
      </div>
    </div>
  );
}

/**
 * One vertical track for a single day.
 *
 * Three layers stacked by z-index:
 *
 *   z-0  click overlay — captures any tap on empty space and turns
 *        the y-offset into a 30-minute slot, fires onAddAtTime
 *   z-10 hour gridlines (pointer-events: none) — purely decorative
 *   z-20 session blocks (anchored <a>s, pointer-events auto) —
 *        navigate to the session page on click
 *   z-30 current-time line (today only) — moss horizontal hairline
 *        with a dot, updates each minute
 *
 * The click overlay is below sessions in the stack, so clicking a
 * session goes to its detail page; clicking anywhere else in the
 * column opens the schedule sheet at the computed time.
 */
function WeekGridColumn({
  day,
  sessions,
  onAddAtTime,
  onOpenDay,
}: {
  day: Day;
  sessions: SessionSummary[];
  onAddAtTime: (time: string) => void;
  /** Open the day timeline modal — used by the overflow chip when
   * a cluster has more than MAX_HORIZONTAL_SLOTS sessions. */
  onOpenDay: () => void;
}) {
  function handleClick(e: React.MouseEvent<HTMLButtonElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const y = Math.max(0, Math.min(e.clientY - rect.top, GRID_HEIGHT - 1));
    // Snap to nearest 30-minute slot.
    const totalSlots = Math.floor(y / (GRID_HOUR_PX / 2));
    const totalMinutes = GRID_START_HOUR * 60 + totalSlots * 30;
    const hour = Math.floor(totalMinutes / 60);
    const min = totalMinutes % 60;
    const time = `${String(hour).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
    onAddAtTime(time);
  }

  const blocks = useMemo(() => computeWeekBlocks(sessions), [sessions]);

  /* Hour gridlines drawn as a single CSS gradient on the column
   * background — 7 columns × 17 hour-line divs would be 119 DOM
   * nodes purely for decoration. The gradient lays a 1px line of
   * stone-soft/35 every GRID_HOUR_PX, leaving the rest of the
   * column transparent. Half-hour dashed marks are intentionally
   * gone — they were noise, not structure. */
  const gridlineStyle: React.CSSProperties = {
    height: GRID_HEIGHT,
    backgroundImage: `linear-gradient(to bottom, rgba(206,199,184,0.35) 1px, transparent 1px)`,
    backgroundSize: `100% ${GRID_HOUR_PX}px`,
    backgroundRepeat: "repeat-y",
  };

  return (
    <div
      className="relative border-l border-[color:var(--color-stone-soft)]/30"
      style={gridlineStyle}
    >
      {/* Click overlay (z-0). Hover tint is quieter than before —
        * a calm parchment wash so the click target is visible
        * without flashing. Today's column does NOT carry an extra
        * background tint: the moss circle on the date and the
        * current-time line are already two strong "today" signals;
        * a third was overkill. */}
      <button
        type="button"
        onClick={handleClick}
        aria-label={`add session on ${day.humanDate}`}
        className="absolute inset-0 z-0 transition-colors hover:bg-[color:var(--color-parchment)]/25"
      />

      {/* Session blocks (z-20). pointer-events: auto on each link so
        * clicks navigate; the surrounding wrapper is pointer-events:
        * none so the click overlay underneath stays reachable
        * anywhere there isn't a session. */}
      <div className="pointer-events-none absolute inset-0 z-20">
        {blocks.map((b, i) =>
          b.kind === "session" ? (
            <WeekGridBlock key={b.session.id} block={b} />
          ) : (
            <WeekGridOverflow key={`overflow-${i}`} block={b} onOpenDay={onOpenDay} />
          ),
        )}
      </div>
      {/* Current-time line is rendered at the grid level (see
        * DesktopWeekTimeGrid) so it can span all 7 columns. The
        * per-column variant was a half-step toward iOS Day view;
        * Google Calendar's full-width line reads better at week
        * scale and was what the trainer asked for. */}
    </div>
  );
}

/**
 * Compute the absolute top + height for each session inside the
 * week grid. Sessions are sorted by start, and any two that overlap
 * get side-by-side widths so neither hides the other — same shape
 * as Google Calendar's column-split.
 *
 * Overlap cap: a cluster of N concurrent sessions splits into at
 * most 3 columns. If N > 3, the first 2 sessions render normally
 * and the third slot becomes an "overflow" chip ("+N more")
 * spanning the cluster's vertical range. Tapping the chip opens
 * the day timeline modal where all sessions are visible at full
 * width. Without this cap, a busy day collapses every session
 * into an unreadable 17px-wide strip — exactly what was happening
 * on the May 4 / 09:00 cluster (8 stacked sessions).
 */
const MAX_HORIZONTAL_SLOTS = 3;

type WeekBlock =
  | {
      kind: "session";
      session: SessionSummary;
      top: number;
      height: number;
      /** Horizontal slot — 0..MAX_HORIZONTAL_SLOTS-1. */
      slot: number;
      totalSlots: number;
    }
  | {
      kind: "overflow";
      /** First overflowed session's top + the cluster's span. */
      top: number;
      height: number;
      slot: number;
      totalSlots: number;
      /** Count of hidden sessions (N for "+N more"). */
      count: number;
    };

function computeWeekBlocks(sessions: SessionSummary[]): WeekBlock[] {
  type Parsed = {
    session: SessionSummary;
    startMin: number;
    endMin: number;
    top: number;
    height: number;
  };
  const visibleEnd = GRID_HOURS * 60;
  const parsed: Parsed[] = [];
  for (const s of sessions) {
    const [hStr = "0", mStr = "0"] = s.formatted_time.split(":");
    const startMin = Number(hStr) * 60 + Number(mStr) - GRID_START_HOUR * 60;
    const endMin = startMin + (s.duration_minutes || 60);
    const clippedStart = Math.max(0, Math.min(startMin, visibleEnd));
    const clippedEnd = Math.max(clippedStart + 20, Math.min(endMin, visibleEnd));
    parsed.push({
      session: s,
      startMin,
      endMin,
      top: clippedStart,
      height: clippedEnd - clippedStart,
    });
  }
  parsed.sort((a, b) => a.startMin - b.startMin);

  // Greedy overlap-cluster: scan sorted starts, when the current
  // event overlaps the active cluster, expand it; otherwise close
  // and assign slot indices for the previous cluster.
  const out: WeekBlock[] = [];
  let cluster: Parsed[] = [];
  let clusterEnd = -1;

  function flush() {
    const total = cluster.length;
    if (total <= MAX_HORIZONTAL_SLOTS) {
      cluster.forEach((p, slot) => {
        out.push({
          kind: "session",
          session: p.session,
          top: p.top,
          height: p.height,
          slot,
          totalSlots: total,
        });
      });
    } else {
      // First (MAX-1) sessions render normally; the last slot
      // becomes the overflow chip. The chip spans the full
      // cluster height so it's tappable across the whole busy
      // band, not just the slot of its first hidden session.
      const visible = cluster.slice(0, MAX_HORIZONTAL_SLOTS - 1);
      const hidden = cluster.slice(MAX_HORIZONTAL_SLOTS - 1);
      visible.forEach((p, slot) => {
        out.push({
          kind: "session",
          session: p.session,
          top: p.top,
          height: p.height,
          slot,
          totalSlots: MAX_HORIZONTAL_SLOTS,
        });
      });
      const overflowTop = hidden[0]!.top;
      const overflowEnd = hidden.reduce(
        (max, p) => Math.max(max, p.top + p.height),
        overflowTop,
      );
      out.push({
        kind: "overflow",
        top: overflowTop,
        height: Math.max(28, overflowEnd - overflowTop),
        slot: MAX_HORIZONTAL_SLOTS - 1,
        totalSlots: MAX_HORIZONTAL_SLOTS,
        count: hidden.length,
      });
    }
    cluster = [];
    clusterEnd = -1;
  }

  for (const p of parsed) {
    if (cluster.length === 0 || p.startMin < clusterEnd) {
      cluster.push(p);
      clusterEnd = Math.max(clusterEnd, p.endMin);
    } else {
      flush();
      cluster.push(p);
      clusterEnd = p.endMin;
    }
  }
  flush();
  return out;
}

function WeekGridBlock({ block }: { block: Extract<WeekBlock, { kind: "session" }> }) {
  const { session, top, height, slot, totalSlots } = block;
  const cancelled = session.status === "cancelled";
  const completed = session.status === "completed";
  const widthPct = 100 / totalSlots;
  const leftPct = slot * widthPct;
  const label = session.client_name ?? session.name ?? "session";

  /* No left-bar accent. The moss now lives in the TIME text — it's
   * the "this is a session" signal carried by typography rather
   * than a chrome stripe. The block itself is a canvas card with
   * an inset hairline ring; against the parchment-tinted column
   * the card lifts cleanly without a colored marker. */
  return (
    <a
      href={`/studio/sessions/${session.id}`}
      className={cn(
        "pointer-events-auto absolute flex flex-col gap-0.5 overflow-hidden rounded-lg bg-[color:var(--color-canvas)] px-2 py-1 text-[11px] leading-tight ring-1 ring-inset ring-[color:var(--color-ink)]/6 shadow-[0_1px_3px_rgba(31,30,27,0.06)] transition-all hover:ring-[color:var(--color-ink)]/12 hover:shadow-[0_4px_14px_-3px_rgba(31,30,27,0.18)]",
        cancelled && "line-through opacity-50",
        completed && "opacity-75",
      )}
      style={{
        top,
        height: Math.max(height, 22),
        left: `calc(${leftPct}% + 2px)`,
        width: `calc(${widthPct}% - 4px)`,
      }}
    >
      <span className="tabular-nums text-[10px] font-semibold text-[color:var(--color-moss)]">
        {session.formatted_time}
      </span>
      <span className="truncate text-[color:var(--color-ink)]/85">{label}</span>
    </a>
  );
}

/**
 * Overflow chip rendered in place of the third+ slot when a cluster
 * has more than MAX_HORIZONTAL_SLOTS sessions. Tapping it opens the
 * day timeline modal so the trainer can see all sessions at full
 * readable width.
 */
function WeekGridOverflow({
  block,
  onOpenDay,
}: {
  block: Extract<WeekBlock, { kind: "overflow" }>;
  onOpenDay: () => void;
}) {
  const { top, height, slot, totalSlots, count } = block;
  const widthPct = 100 / totalSlots;
  const leftPct = slot * widthPct;
  return (
    <button
      type="button"
      onClick={onOpenDay}
      aria-label={`${count} more sessions — open day view`}
      className="pointer-events-auto absolute flex items-center justify-center rounded-lg bg-[color:var(--color-canvas)] text-[11px] font-semibold text-[color:var(--color-moss)] ring-1 ring-inset ring-[color:var(--color-moss)]/25 shadow-[0_1px_3px_rgba(31,30,27,0.06)] transition-all hover:ring-[color:var(--color-moss)]/45 hover:shadow-[0_4px_14px_-3px_rgba(31,30,27,0.18)]"
      style={{
        top,
        height: Math.max(height, 22),
        left: `calc(${leftPct}% + 2px)`,
        width: `calc(${widthPct}% - 4px)`,
      }}
    >
      +{count} more
    </button>
  );
}

/**
 * Across-week "you are here" line.
 *
 * Spans all 7 day-columns (Google Calendar shape) rather than
 * clipping to today's track. The moss line crosses the entire
 * grid; a brighter, ringed dot anchors at the LEFT edge of
 * today's column so the trainer's eye lands first on "today, now"
 * and then follows the line out to compare to other days.
 *
 * Computes the offset in the TRAINER's timezone, not the
 * browser's — a trainer in Beirut on a laptop set to UTC still
 * sees the line at the right hour. Auto-updates every 60s; the
 * line is a glance affordance, not a stopwatch.
 *
 * Positioning math: the parent grid is
 * `[48px gutter | 7 columns at (100%-48px)/7 each]`. The line
 * starts at the right edge of the gutter (`left: 48px`) and
 * stretches to `right: 0`. Today's column begins at
 * `(todayIdx / 7) * 100%` within the line's own width — that
 * places the anchor dot exactly at the column boundary, no
 * pixel-math required.
 */
function CurrentTimeLine({
  timezone,
  todayIdx,
}: {
  timezone: string;
  todayIdx: number;
}) {
  const [top, setTop] = useState<number | null>(() => computeNowOffset(timezone));

  useEffect(() => {
    const tick = () => setTop(computeNowOffset(timezone));
    tick();
    const id = window.setInterval(tick, 60_000);
    return () => window.clearInterval(id);
  }, [timezone]);

  if (top === null) return null;

  return (
    <div
      aria-hidden
      className="pointer-events-none absolute z-30"
      style={{
        top,
        left: 48,
        right: 0,
      }}
    >
      <div className="relative h-[1.5px] bg-[color:var(--color-moss)]/55">
        {/* Today's segment is brighter so the eye finds "now"
          * quickly; the rest of the line stays moss/55 so it
          * reads as context without screaming. The brighter
          * segment is one column wide. */}
        <div
          className="absolute top-0 h-full bg-[color:var(--color-moss-deep)]"
          style={{
            left: `${(todayIdx / 7) * 100}%`,
            width: `${(1 / 7) * 100}%`,
          }}
        />
        {/* Anchor dot at today's column left edge. White ring
          * makes it pop off the canvas no matter what's behind. */}
        <span
          className="absolute top-1/2 size-2.5 -translate-y-1/2 rounded-full bg-[color:var(--color-moss-deep)] ring-2 ring-[color:var(--color-canvas)]"
          style={{ left: `calc(${(todayIdx / 7) * 100}% - 5px)` }}
        />
      </div>
    </div>
  );
}

function computeNowOffset(timezone: string): number | null {
  // Read the current trainer-local hour:minute via date-fns-tz so
  // a browser tz different from the trainer's studio tz doesn't
  // misplace the line.
  try {
    const hhmm = formatInTimeZone(new Date(), timezone, "HH:mm");
    const [hStr = "0", mStr = "0"] = hhmm.split(":");
    const h = Number(hStr);
    const m = Number(mStr);
    const minutesFromStart = (h - GRID_START_HOUR) * 60 + m;
    if (minutesFromStart < 0 || minutesFromStart > GRID_HOURS * 60) return null;
    return minutesFromStart;
  } catch {
    // Bad tz string → fail closed (hide the line) rather than
    // throwing during render.
    return null;
  }
}

/* ─── Desktop: month grid ──────────────────────────────────────── */

/**
 * iPad-style month grid. Each cell carries a soft parchment base
 * (hover deepens) so the grid reads as a calendar of cards rather
 * than a void with chips floating in it. Today's number wears the
 * moss circle. Event chips quote the moss left-bar over a slightly
 * lighter row so the date number stays the dominant anchor.
 *
 * Tapping a cell opens a centered `DesktopDayModal` containing the
 * `DayTimeline` — the booking experience matches the iOS pattern:
 * tap a day → see the sequence → tap an empty slot to schedule.
 */
function DesktopMonthView({
  days,
  sessionsByDay,
  onPick,
}: {
  days: Day[];
  sessionsByDay: Record<string, SessionSummary[]>;
  onPick: (d: Day) => void;
}) {
  return (
    <div className="hidden md:block">
      <MonthHeader />
      <div className="grid grid-cols-7 gap-1.5">
        {days.map((d) => (
          <MonthCell
            key={d.key}
            day={d}
            sessions={sessionsByDay[d.key] ?? []}
            onPick={() => onPick(d)}
          />
        ))}
      </div>
    </div>
  );
}

function MonthHeader() {
  const labels = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
  return (
    <div className="grid grid-cols-7 gap-1.5 px-2 pb-2.5">
      {labels.map((l) => (
        <div
          key={l}
          className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[color:var(--color-stone)]"
        >
          {l}
        </div>
      ))}
    </div>
  );
}

function MonthCell({
  day,
  sessions,
  onPick,
}: {
  day: Day;
  sessions: SessionSummary[];
  onPick: () => void;
}) {
  const visible = sessions.slice(0, 2);
  const overflow = sessions.length - visible.length;
  return (
    <button
      type="button"
      onClick={onPick}
      className={cn(
        // Cell base: very light parchment so the grid reads as a
        // calendar of cards without competing with the chips
        // inside. Today gets a slightly stronger tint but no
        // additional ring — the moss circle on the date number is
        // signal enough. Out-of-month cells dim via opacity only
        // (was previously also lightening the bg, which fought the
        // opacity and looked muddy).
        "group flex min-h-[7.5rem] flex-col gap-1.5 rounded-xl bg-[color:var(--color-parchment)]/15 p-1.5 text-left transition-colors",
        "hover:bg-[color:var(--color-parchment)]/45",
        day.isToday && "bg-[color:var(--color-parchment)]/40 hover:bg-[color:var(--color-parchment)]/60",
        !day.inMonth && "opacity-50 hover:opacity-80",
      )}
      aria-label={`open ${day.humanDate}`}
    >
      <DateBadge
        dayNum={day.dayNum}
        isToday={day.isToday}
        isMuted={!day.inMonth}
        size="sm"
      />
      {visible.length > 0 ? (
        <div className="flex flex-col gap-0.5">
          {visible.map((s) => (
            <MonthEventChip key={s.id} session={s} muted={!day.inMonth} />
          ))}
          {overflow > 0 ? (
            <span className="pl-2 text-[10px] font-medium text-[color:var(--color-stone)]">
              +{overflow} more
            </span>
          ) : null}
        </div>
      ) : null}
    </button>
  );
}

/**
 * Compact session chip used inside month cells. Moss left-edge
 * against canvas-tinted text — a calmer cousin of iOS's solid
 * colored bars, tuned for our editorial palette. Cancelled chips
 * strike through and fade so the trainer still sees the booking
 * history without it competing with active rows.
 */
function MonthEventChip({
  session,
  muted,
}: {
  session: SessionSummary;
  muted: boolean;
}) {
  const cancelled = session.status === "cancelled";
  return (
    <span
      className={cn(
        // Tiny month-cell chip — matches the canvas-card + moss
        // typography of week/timeline blocks. At month density the
        // ring is dropped (too much visual weight for a 14px-tall
        // chip), the canvas fill alone carries the demarcation
        // against the cell's parchment tint.
        "flex items-center gap-1.5 rounded-md bg-[color:var(--color-canvas)]/90 py-0.5 pl-1.5 pr-1 text-[11px] leading-tight",
        cancelled && "line-through opacity-50",
        muted && "opacity-60",
      )}
    >
      <span className="tabular-nums font-semibold text-[color:var(--color-moss)]">
        {session.formatted_time}
      </span>
      <span className="truncate text-[color:var(--color-ink)]/85">
        {session.client_name ?? session.name ?? "session"}
      </span>
    </span>
  );
}

/* ─── Desktop: day-timeline modal ──────────────────────────────── */

/**
 * The desktop equivalent of mobile's inline day-timeline detail.
 * Centered card on a tinted backdrop, with the day's sessions laid
 * out by hour and an explicit "+ add" button in the header for
 * times outside the timeline range or when the trainer just wants
 * the form open with default time. Escape + click-outside close.
 *
 * Built with the same primitives as our ConfirmDialog rather than a
 * full Radix Dialog — the surface is informational + click-through
 * to quick-schedule, not a focus-trapped form, so the lighter chrome
 * is enough.
 */
function DesktopDayModal({
  day,
  sessions,
  onClose,
  onAddAtTime,
  onAdd,
}: {
  day: Day;
  sessions: SessionSummary[];
  onClose: () => void;
  onAddAtTime: (time: string) => void;
  onAdd: () => void;
}) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[color:var(--color-ink)]/30 p-4 backdrop-blur-sm dialog-overlay-in"
      onClick={onClose}
      role="presentation"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg rounded-3xl bg-[color:var(--color-canvas)] p-6 shadow-[0_24px_64px_-16px_rgba(31,30,27,0.35)] dialog-content-rise"
        role="dialog"
        aria-modal="true"
        aria-label={`schedule for ${day.humanDate}`}
      >
        <header className="flex items-center justify-between gap-3 pb-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[color:var(--color-stone)]">
              {day.isToday ? "today · " : ""}
              {day.humanDate}
            </p>
            <h2 className="mt-1 text-xl font-semibold tracking-tight">
              {sessions.length === 0
                ? "nothing scheduled"
                : `${sessions.length} session${sessions.length === 1 ? "" : "s"}`}
            </h2>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={onAdd}
              className="inline-flex h-9 items-center gap-1.5 rounded-full bg-[color:var(--color-ink)] px-3.5 text-xs font-medium text-[color:var(--color-canvas)] hover:bg-[color:var(--color-moss-deep)]"
            >
              <PlusIcon />
              add
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="close"
              className="inline-flex h-9 w-9 items-center justify-center rounded-full text-[color:var(--color-stone)] hover:bg-[color:var(--color-parchment)] hover:text-[color:var(--color-ink)]"
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
                <path d="M3 3l8 8M11 3l-8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
              </svg>
            </button>
          </div>
        </header>
        <DayTimeline
          day={day}
          sessions={sessions}
          onAddAtTime={onAddAtTime}
          variant="modal"
        />
        <p className="mt-3 text-center text-[11px] text-[color:var(--color-stone)]">
          tap an empty hour to drop a session in
        </p>
      </div>
    </div>
  );
}

function PlusIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
      <path
        d="M7 2v10M2 7h10"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
      />
    </svg>
  );
}
