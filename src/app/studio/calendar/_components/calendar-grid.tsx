"use client";

import { useEffect, useState } from "react";

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

/**
 * Three layouts, picked by viewport × view. The chrome is deliberately
 * thin everywhere — iOS Calendar treats the canvas itself as the
 * surface and lets the numbers + events do the work. We follow:
 *
 *  - **Mobile + week** — vertical day list. 7 days fit comfortably as
 *    full-width rows; empty days collapse to a one-line entry.
 *  - **Mobile + 2 weeks / month** — iOS mini-grid. Numbers float on
 *    the canvas. Today wears a filled moss circle, selected day a
 *    filled ink circle. Days with sessions get tiny moss dots.
 *    Detail of the selected day renders below.
 *  - **Desktop (md+)** — 7-column grid. Day numbers carry the
 *    weight; session cards float without column backgrounds. Today
 *    is moss-circled. Hovering an empty area surfaces the
 *    quick-schedule affordance.
 */
export function CalendarGrid({ days, sessionsByDay, clients, workouts, view }: Props) {
  const [picked, setPicked] = useState<Day | null>(null);
  const isMiniGridView = view === "2weeks" || view === "month";

  return (
    <>
      {/* Mobile */}
      <div className="md:hidden">
        {isMiniGridView ? (
          <MobileMiniGridView
            days={days}
            sessionsByDay={sessionsByDay}
            view={view}
            onAdd={(day) => setPicked(day)}
          />
        ) : (
          <MobileDayList
            days={days}
            sessionsByDay={sessionsByDay}
            onPick={setPicked}
          />
        )}
      </div>

      {/* Desktop */}
      {view === "month" ? (
        <DesktopMonthView
          days={days}
          sessionsByDay={sessionsByDay}
          onPick={setPicked}
        />
      ) : (
        <DesktopWeekView
          days={days}
          sessionsByDay={sessionsByDay}
          onPick={setPicked}
        />
      )}

      {picked ? (
        <QuickSchedule
          isoDate={picked.key}
          dayLabel={picked.humanDate}
          clients={clients}
          workouts={workouts}
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
 * the mobile day-list row. Each adjusts the circle diameter and
 * font weight but keeps the same color logic.
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
      aria-hidden={false}
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
 * regardless of event count. The colour matches the brand's "this
 * day has activity" signal and stays consistent across today /
 * non-today / selected (no awkward color flip on tap).
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

/* ─── Mobile: vertical week list ─────────────────────────────────── */

/**
 * iOS Calendar's mobile "list" mode: each day is a row, empty days
 * collapse to a thin header line, days with sessions expand to show
 * a stacked list of cards. The chrome receded considerably — empty
 * rows no longer carry a parchment fill — so the week reads as a
 * scannable schedule rather than a grid of boxes.
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
    <ul className="flex flex-col">
      {days.map((d, i) => {
        const sessions = sessionsByDay[d.key] ?? [];
        const isEmpty = sessions.length === 0;
        const isLast = i === days.length - 1;
        return (
          <li
            key={d.key}
            className={cn(
              !isLast && "border-b border-[color:var(--color-stone-soft)]/60",
            )}
          >
            <button
              type="button"
              onClick={() => onPick(d)}
              className="group flex w-full items-center gap-3 py-3 text-left transition-colors hover:bg-[color:var(--color-parchment)]/40"
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
                  <span className="text-sm text-[color:var(--color-ink)]/40">
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
                className="inline-flex h-8 w-8 items-center justify-center rounded-full text-[color:var(--color-ink)]/35 transition-colors group-hover:bg-[color:var(--color-ink)] group-hover:text-[color:var(--color-canvas)]"
              >
                <PlusIcon />
              </span>
            </button>
            {sessions.length > 0 ? (
              <ul className="flex flex-col gap-1.5 pb-3 pl-[60px]">
                {sessions.map((s) => (
                  <li key={s.id}>
                    <SessionRow session={s} variant="card" />
                  </li>
                ))}
              </ul>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

/* ─── Mobile: mini-grid + detail panel (2 weeks / month) ─────────── */

function MobileMiniGridView({
  days,
  sessionsByDay,
  view,
  onAdd,
}: {
  days: Day[];
  sessionsByDay: Record<string, SessionSummary[]>;
  view: "2weeks" | "month";
  onAdd: (day: Day) => void;
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
  onAdd,
}: {
  day: Day;
  sessions: SessionSummary[];
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
      {sessions.length === 0 ? (
        <p className="rounded-2xl bg-[color:var(--color-parchment)]/40 px-4 py-6 text-center text-sm text-[color:var(--color-ink)]/55">
          nothing scheduled. tap add to drop a session in.
        </p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {sessions.map((s) => (
            <li key={s.id}>
              <SessionRow session={s} variant="card" />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/* ─── Desktop: week / 2-weeks ──────────────────────────────────── */

/**
 * iPad-style week layout. 7 columns without per-column backgrounds —
 * the column itself is just a flex stack. Each day's header carries
 * the weekday + the date badge (moss circle on today), and session
 * cards float below. Empty space inside the column is the
 * quick-schedule tap target; hover surfaces the affordance.
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
        "group relative flex min-h-[10rem] flex-col gap-2 rounded-2xl p-1.5 transition-colors",
        "hover:bg-[color:var(--color-parchment)]/40",
        day.isToday && "bg-[color:var(--color-parchment)]/25",
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
          className="inline-flex h-8 w-8 items-center justify-center rounded-full text-[color:var(--color-ink)]/45 opacity-0 transition-opacity hover:bg-[color:var(--color-ink)] hover:text-[color:var(--color-canvas)] focus-visible:opacity-100 group-hover:opacity-100"
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
 * iPad-style month grid. No per-cell backgrounds at rest — cells
 * are clean canvas separated by gap-1.5. Today's number wears the
 * moss circle. Each cell shows up to 2 event chips as quiet rows
 * with a moss left-bar; overflow collapses to "+N more". Tapping a
 * cell opens quick-schedule for that date.
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
        "group flex min-h-[7rem] flex-col gap-1.5 rounded-xl p-1.5 text-left transition-colors",
        "hover:bg-[color:var(--color-parchment)]/55",
        !day.inMonth && "opacity-60",
      )}
      aria-label={`add session on ${day.humanDate}`}
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
 * Compact session chip used inside month cells. iOS uses a colored
 * solid bar with overlaid white text; in our palette, a moss
 * left-edge against parchment-tinted text reads with similar
 * directness without overwhelming the cell at month-level density.
 *
 * Cancelled sessions strike through and dim — the row still shows
 * because the trainer's mental model is "this was on the books",
 * but the chip leans away.
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
        "flex items-center gap-1.5 rounded-md border-l-2 border-[color:var(--color-moss)] bg-[color:var(--color-parchment)]/60 py-0.5 pl-1.5 pr-1 text-[11px] leading-tight",
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
