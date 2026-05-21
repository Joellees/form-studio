"use client";

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
export function CalendarGrid({ days, sessionsByDay, clients, workouts, view }: Props) {
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

      {/* Desktop */}
      {view === "month" ? (
        <DesktopMonthView
          days={days}
          sessionsByDay={sessionsByDay}
          onPick={(d) => setTimelineDay(d)}
        />
      ) : (
        <DesktopWeekView
          days={days}
          sessionsByDay={sessionsByDay}
          onPick={(d) => openQuickSchedule(d)}
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
      // re-enable pointer events on the block itself.
      className={cn(
        "pointer-events-auto absolute left-1.5 right-2 flex flex-col gap-0.5 overflow-hidden rounded-lg border-l-[3px] border-[color:var(--color-moss)] bg-[color:var(--color-parchment)] px-2 py-1 text-[11px] leading-tight shadow-[0_1px_0_rgba(31,30,27,0.04),0_4px_12px_-6px_rgba(31,30,27,0.18)] transition-shadow hover:shadow-[0_2px_0_rgba(31,30,27,0.06),0_8px_18px_-6px_rgba(31,30,27,0.28)]",
        cancelled && "line-through opacity-50",
        completed && "opacity-75",
      )}
      style={{ top, height: Math.max(height, 28) }}
    >
      <span className="tabular-nums text-[10px] font-semibold uppercase tracking-[0.12em] text-[color:var(--color-stone)]">
        {session.formatted_time}
      </span>
      <span className="truncate font-medium text-[color:var(--color-ink)]">{label}</span>
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

/* ─── Desktop: week / 2-weeks ──────────────────────────────────── */

/**
 * iPad-style week layout. 7 columns with a soft parchment base — the
 * column reads as a card without competing with its content. Each
 * day's header carries the weekday + the date badge (moss circle on
 * today), and session cards float below. Empty space inside the
 * column is the quick-schedule tap target; hover surfaces the
 * affordance.
 */
function DesktopWeekView({
  days,
  sessionsByDay,
  onPick,
}: {
  days: Day[];
  sessionsByDay: Record<string, SessionSummary[]>;
  onPick: (d: Day) => void;
}) {
  return (
    <div className="hidden md:grid md:grid-cols-7 md:gap-3">
      {days.map((d) => (
        <DesktopWeekColumn
          key={d.key}
          day={d}
          sessions={sessionsByDay[d.key] ?? []}
          onPick={() => onPick(d)}
        />
      ))}
    </div>
  );
}

function DesktopWeekColumn({
  day,
  sessions,
  onPick,
}: {
  day: Day;
  sessions: SessionSummary[];
  onPick: () => void;
}) {
  return (
    <section
      className={cn(
        "group relative flex min-h-[10rem] flex-col gap-2 rounded-2xl bg-[color:var(--color-parchment)]/30 p-1.5 transition-colors",
        "hover:bg-[color:var(--color-parchment)]/55",
        day.isToday && "bg-[color:var(--color-parchment)]/60 hover:bg-[color:var(--color-parchment)]/75",
      )}
    >
      <header className="flex items-center justify-between gap-2 px-1.5 pt-1">
        <span className="flex items-center gap-2">
          <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[color:var(--color-stone)]">
            {day.weekday}
          </span>
          <DateBadge dayNum={day.dayNum} isToday={day.isToday} size="sm" />
        </span>
        <button
          type="button"
          onClick={onPick}
          aria-label={`add session on ${day.humanDate}`}
          className="inline-flex h-8 w-8 items-center justify-center rounded-full text-[color:var(--color-ink)]/55 opacity-0 transition-opacity hover:bg-[color:var(--color-ink)] hover:text-[color:var(--color-canvas)] focus-visible:opacity-100 group-hover:opacity-100"
        >
          <PlusIcon />
        </button>
      </header>
      {sessions.length > 0 ? (
        <div className="flex flex-col gap-1.5">
          {sessions.map((s) => (
            <SessionRow key={s.id} session={s} variant="card" />
          ))}
        </div>
      ) : null}
      {/* Click-anywhere-in-the-column affordance for adding. Stacks
        * BELOW the cards so it can't intercept a click on a session.
        * Flex-1 so a sparse column still has plenty of click area. */}
      <button
        type="button"
        onClick={onPick}
        aria-label={`add session on ${day.humanDate}`}
        className="flex-1 rounded-xl"
      />
    </section>
  );
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
        "group flex min-h-[7.5rem] flex-col gap-1.5 rounded-xl bg-[color:var(--color-parchment)]/30 p-1.5 text-left transition-colors",
        "hover:bg-[color:var(--color-parchment)]/65",
        day.isToday && "bg-[color:var(--color-parchment)]/60 hover:bg-[color:var(--color-parchment)]/80",
        !day.inMonth && "bg-[color:var(--color-parchment)]/15 opacity-65 hover:opacity-90",
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
        "flex items-center gap-1.5 rounded-md border-l-2 border-[color:var(--color-moss)] bg-[color:var(--color-canvas)]/85 py-0.5 pl-1.5 pr-1 text-[11px] leading-tight",
        cancelled && "line-through opacity-50",
        muted && "opacity-60",
      )}
    >
      <span className="tabular-nums text-[color:var(--color-stone)]">
        {session.formatted_time}
      </span>
      <span className="truncate font-medium text-[color:var(--color-ink)]">
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
        className="w-full max-w-lg rounded-3xl bg-[color:var(--color-canvas)] p-6 shadow-[0_24px_64px_-16px_rgba(31,30,27,0.35)] dialog-content-in"
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
