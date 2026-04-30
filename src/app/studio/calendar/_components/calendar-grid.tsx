"use client";

import { useState } from "react";

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
 * Calendar with two layouts:
 *
 *   - **Mobile (<md)**: vertical sectioned list. Each day is a row.
 *     Empty days collapse to a thin row with the date + a `+` to
 *     schedule. Non-empty days expand into stacked session cards.
 *     A 7-column grid does not fit at 375px and forced grid cells
 *     to be unreadable; the list reads top-to-bottom like a journal.
 *   - **Desktop (md+)**: the classic grid — 7 cols for week / 2 weeks,
 *     7-wide month grid for month view (orphan cells dimmed when
 *     they fall outside the active month).
 *
 * Picking month view on mobile is currently coerced down to the
 * same list layout (the dates outside the month are simply
 * dimmed) — see MOBILE-AUDIT.md E2.
 */
export function CalendarGrid({ days, sessionsByDay, clients, workouts, view }: Props) {
  const [picked, setPicked] = useState<Day | null>(null);

  return (
    <>
      {/* Mobile: vertical day list (week + 2-weeks; month falls back too). */}
      <MobileDayList
        days={days}
        sessionsByDay={sessionsByDay}
        onPick={setPicked}
        showWeekday={view !== "month"}
      />

      {/* Desktop: grid layouts */}
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
            const empty = sessions.length === 0;
            return (
              <div
                key={d.key}
                className={cn(
                  "flex min-h-[10rem] flex-col gap-2 rounded-2xl bg-[color:var(--color-parchment)]/55 p-3",
                  empty ? "" : "",
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
 * Vertical list of days for mobile. Day rows fall into one of two
 * shapes:
 *
 *   1. Empty day — a 44px-tall thin row: weekday/date on the left,
 *      `+` on the right. Tapping anywhere on the row opens the
 *      quick-schedule sheet.
 *   2. Day with sessions — a section with a sticky day header on top
 *      and session cards stacked below. The day header itself is
 *      tappable (also opens quick-schedule).
 */
function MobileDayList({
  days,
  sessionsByDay,
  onPick,
  showWeekday,
}: {
  days: Day[];
  sessionsByDay: Record<string, SessionSummary[]>;
  onPick: (d: Day) => void;
  showWeekday: boolean;
}) {
  return (
    <ul className="flex flex-col gap-2 md:hidden">
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
                  !d.inMonth && "opacity-50",
                  d.isToday && "ring-1 ring-[color:var(--color-ink)]/15",
                )}
                aria-label={`add session on ${d.humanDate}`}
              >
                <span className="flex items-baseline gap-2">
                  {showWeekday ? (
                    <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[color:var(--color-stone)]">
                      {d.weekday}
                    </span>
                  ) : null}
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
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                    <path
                      d="M7 2v10M2 7h10"
                      stroke="currentColor"
                      strokeWidth="1.6"
                      strokeLinecap="round"
                    />
                  </svg>
                </span>
              </button>
            ) : (
              <section
                className={cn(
                  "rounded-2xl bg-[color:var(--color-parchment)]/55 p-3",
                  !d.inMonth && "opacity-70",
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
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                      <path
                        d="M7 2v10M2 7h10"
                        stroke="currentColor"
                        strokeWidth="1.6"
                        strokeLinecap="round"
                      />
                    </svg>
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
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
          <path d="M7 2v10M2 7h10" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
        </svg>
      </button>
    </div>
  );
}
