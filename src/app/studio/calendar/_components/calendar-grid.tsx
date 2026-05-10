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
 * Three layouts, picked by viewport × view:
 *
 *  - **Mobile + week** — vertical day list. 7 days fit comfortably
 *    as full-width sections; sessions stack inline under each day.
 *  - **Mobile + 2 weeks / month** — iOS-style: small 7-col grid with
 *    a dot indicator on busy days, and the selected day's sessions
 *    rendered as cards below the grid. A 14- or 42-day vertical
 *    list is too much to scroll; the grid lets the trainer scan
 *    the period at a glance and tap into a single day.
 *  - **Desktop (md+)** — the classic full grid: 7 cols of full
 *    session cards for week / 2-weeks, and a date-cell month grid
 *    with overflow indicators for month.
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
        <div className="hidden md:block">
          <MonthHeader />
          <div className="grid grid-cols-7 gap-1.5">
            {days.map((d) => (
              <MonthCell
                key={d.key}
                day={d}
                sessions={sessionsByDay[d.key] ?? []}
                onPick={() => setPicked(d)}
              />
            ))}
          </div>
        </div>
      ) : (
        <div className="hidden md:grid md:grid-cols-7 md:gap-3">
          {days.map((d) => {
            const sessions = sessionsByDay[d.key] ?? [];
            return (
              <div
                key={d.key}
                className={cn(
                  "flex min-h-[10rem] flex-col gap-2 rounded-2xl bg-[color:var(--color-parchment)]/55 p-3",
                  d.isToday ? "ring-1 ring-[color:var(--color-ink)]/15" : "",
                )}
              >
                <DesktopDayHeader day={d} onPick={() => setPicked(d)} />
                {sessions.length > 0 ? (
                  <div className="flex flex-col gap-1.5">
                    {sessions.map((s) => (
                      <SessionRow key={s.id} session={s} variant="card" />
                    ))}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
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

/**
 * Mobile vertical day list — used for week view only. Each day is a
 * tappable section: empty days collapse to a 44px row with a `+`
 * button; non-empty days expand to show stacked session cards.
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
            {isEmpty ? (
              <button
                type="button"
                onClick={() => onPick(d)}
                className={cn(
                  "flex min-h-11 w-full items-center justify-between gap-3 rounded-xl bg-[color:var(--color-parchment)]/40 px-4 text-left transition-colors hover:bg-[color:var(--color-parchment)]",
                  d.isToday && "ring-1 ring-[color:var(--color-ink)]/15",
                )}
                aria-label={`add session on ${d.humanDate}`}
              >
                <span className="flex items-baseline gap-2">
                  <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[color:var(--color-stone)]">
                    {d.weekday}
                  </span>
                  <span
                    className={cn(
                      "text-sm font-semibold tabular-nums",
                      d.isToday
                        ? "text-[color:var(--color-ink)]"
                        : "text-[color:var(--color-ink)]/55",
                    )}
                  >
                    {d.dayNum}
                  </span>
                  {d.isToday ? (
                    <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[color:var(--color-moss-deep)]">
                      today
                    </span>
                  ) : null}
                </span>
                <span
                  aria-hidden
                  className="flex h-8 w-8 items-center justify-center rounded-full text-[color:var(--color-ink)]/55"
                >
                  <PlusIcon />
                </span>
              </button>
            ) : (
              <section
                className={cn(
                  "rounded-2xl bg-[color:var(--color-parchment)]/55 p-3",
                  d.isToday && "ring-1 ring-[color:var(--color-ink)]/15",
                )}
              >
                <button
                  type="button"
                  onClick={() => onPick(d)}
                  className="flex min-h-11 w-full items-center justify-between gap-3 rounded-xl px-1 text-left"
                  aria-label={`add session on ${d.humanDate}`}
                >
                  <span className="flex items-baseline gap-2">
                    <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[color:var(--color-stone)]">
                      {d.weekday}
                    </span>
                    <span
                      className={cn(
                        "text-base font-semibold tabular-nums",
                        d.isToday
                          ? "text-[color:var(--color-ink)]"
                          : "text-[color:var(--color-ink)]/65",
                      )}
                    >
                      {d.dayNum}
                    </span>
                    {d.isToday ? (
                      <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[color:var(--color-moss-deep)]">
                        today
                      </span>
                    ) : null}
                  </span>
                  <span
                    aria-hidden
                    className="flex h-9 w-9 items-center justify-center rounded-full text-[color:var(--color-ink)]/65 hover:bg-[color:var(--color-ink)] hover:text-[color:var(--color-canvas)]"
                  >
                    <PlusIcon />
                  </span>
                </button>
                <div className="mt-2 flex flex-col gap-1.5">
                  {sessions.map((s) => (
                    <SessionRow key={s.id} session={s} variant="card" />
                  ))}
                </div>
              </section>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/**
 * iOS-pattern mobile calendar: a small 7-column grid with day
 * numbers (and a small dot indicator on days that have sessions),
 * plus the selected day's sessions rendered as cards below.
 * Tapping a different day reflows the detail panel.
 *
 * Defaults to today if today is in the visible range, otherwise the
 * first day inside the active month (for month view), otherwise the
 * first day of the range. If the user navigates to a different
 * window (prev/next) the selection is rebased on the new window.
 */
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
  // view switch). Otherwise the previous selectedKey would stick to a
  // day that's no longer in the grid.
  useEffect(() => {
    if (!days.some((d) => d.key === selectedKey)) {
      setSelectedKey(defaultKey);
    }
  }, [days, defaultKey, selectedKey]);

  const selected = days.find((d) => d.key === selectedKey) ?? days[0];

  return (
    <div className="space-y-5">
      <div>
        <div className="grid grid-cols-7 gap-1 px-1 pb-2">
          {["m", "t", "w", "t", "f", "s", "s"].map((l, i) => (
            <div
              key={i}
              className="text-center text-[10px] font-semibold uppercase tracking-[0.16em] text-[color:var(--color-stone)]"
            >
              {l}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {days.map((d) => (
            <MiniGridCell
              key={d.key}
              day={d}
              hasSessions={(sessionsByDay[d.key] ?? []).length > 0}
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
  isSelected,
  showOutOfMonthMute,
  onSelect,
}: {
  day: Day;
  hasSessions: boolean;
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
      className={cn(
        "relative flex aspect-square min-h-11 flex-col items-center justify-center rounded-full text-sm tabular-nums transition-colors",
        isSelected
          ? "bg-[color:var(--color-ink)] font-semibold text-[color:var(--color-canvas)]"
          : day.isToday
            ? "font-semibold text-[color:var(--color-ink)] ring-1 ring-[color:var(--color-ink)]/30"
            : muted
              ? "text-[color:var(--color-ink)]/30"
              : "text-[color:var(--color-ink)]/80 hover:bg-[color:var(--color-parchment)]",
      )}
    >
      <span>{day.dayNum}</span>
      {hasSessions && !isSelected ? (
        <span
          aria-hidden
          className={cn(
            "absolute bottom-1.5 size-1 rounded-full",
            day.isToday
              ? "bg-[color:var(--color-moss-deep)]"
              : "bg-[color:var(--color-sienna)]",
          )}
        />
      ) : null}
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
          Nothing scheduled. Tap add to drop a session in.
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

function MonthHeader() {
  const labels = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
  return (
    <div className="hidden grid-cols-7 gap-1.5 px-2 md:grid">
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
        "group flex min-h-[7rem] flex-col gap-1 rounded-xl p-2 text-left transition-colors",
        day.inMonth
          ? "bg-[color:var(--color-parchment)]/55 hover:bg-[color:var(--color-parchment)]"
          : "bg-[color:var(--color-parchment)]/25 text-[color:var(--color-ink)]/45 hover:bg-[color:var(--color-parchment)]/45",
        day.isToday ? "ring-1 ring-[color:var(--color-ink)]/15" : "",
      )}
      aria-label={`add session on ${day.humanDate}`}
    >
      <div className="flex items-center justify-between">
        <span
          className={cn(
            "text-sm font-semibold tabular-nums tracking-tight",
            day.isToday ? "text-[color:var(--color-ink)]" : "",
          )}
        >
          {day.dayNum}
        </span>
        {sessions.length > 0 ? (
          <span className="text-[10px] tabular-nums text-[color:var(--color-stone)]">
            {sessions.length}
          </span>
        ) : null}
      </div>
      {visible.length > 0 ? (
        <div className="flex flex-col gap-1">
          {visible.map((s) => (
            <div
              key={s.id}
              className="truncate rounded-md bg-[color:var(--color-canvas)] px-1.5 py-0.5 text-[10px] tabular-nums"
            >
              <span className="text-[color:var(--color-stone)]">{s.formatted_time}</span>{" "}
              <span className="font-medium text-[color:var(--color-ink)]">
                {s.client_name ?? s.name ?? "session"}
              </span>
            </div>
          ))}
          {overflow > 0 ? (
            <span className="text-[10px] text-[color:var(--color-stone)]">
              +{overflow} more
            </span>
          ) : null}
        </div>
      ) : null}
    </button>
  );
}

function DesktopDayHeader({ day, onPick }: { day: Day; onPick: () => void }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <button
        type="button"
        onClick={onPick}
        className="flex flex-1 items-baseline gap-2 rounded-lg text-left transition-opacity hover:opacity-80"
        aria-label={`add session on ${day.humanDate}`}
      >
        <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[color:var(--color-stone)]">
          {day.weekday}
        </span>
        <span
          className={cn(
            "text-base font-semibold tabular-nums tracking-tight md:text-lg",
            day.isToday
              ? "text-[color:var(--color-ink)]"
              : "text-[color:var(--color-ink)]/60",
          )}
        >
          {day.dayNum}
        </span>
      </button>
      <button
        type="button"
        onClick={onPick}
        aria-label={`add session on ${day.humanDate}`}
        className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-[color:var(--color-ink)]/70 transition-colors hover:bg-[color:var(--color-ink)] hover:text-[color:var(--color-canvas)]"
      >
        <PlusIcon />
      </button>
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
