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
 * One grid component, three layouts. The first two views render
 * full session cards inside each day; the month view downscales to
 * a calendar-cell footprint with a count badge and at most two
 * inline sessions, since 30+ days won't fit if every cell is tall.
 */
export function CalendarGrid({ days, sessionsByDay, clients, workouts, view }: Props) {
  const [picked, setPicked] = useState<Day | null>(null);

  if (view === "month") {
    return (
      <>
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

  // week / 2weeks: 7-column grid; 2weeks uses two stacked rows.
  return (
    <>
      <div
        className={cn(
          "grid gap-2 md:gap-3",
          view === "2weeks" ? "md:grid-cols-7" : "md:grid-cols-7",
        )}
      >
        {days.map((d) => {
          const sessions = sessionsByDay[d.key] ?? [];
          const empty = sessions.length === 0;
          return (
            <div
              key={d.key}
              className={cn(
                "flex flex-col gap-2 rounded-2xl bg-[color:var(--color-parchment)]/55 p-3",
                empty ? "min-h-[3rem]" : "min-h-[4.5rem]",
                "md:min-h-[10rem]",
                d.isToday ? "ring-1 ring-[color:var(--color-ink)]/15" : "",
              )}
            >
              <DayHeader day={d} onPick={() => setPicked(d)} compact={false} />
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
        "group flex min-h-[5rem] flex-col gap-1 rounded-xl p-2 text-left transition-colors md:min-h-[7rem]",
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

function DayHeader({
  day,
  onPick,
  compact,
}: {
  day: Day;
  onPick: () => void;
  compact: boolean;
}) {
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
        {!compact ? (
          <span className="ml-auto text-[11px] text-[color:var(--color-stone)]/70 md:hidden">
            tap to add
          </span>
        ) : null}
      </button>
      <button
        type="button"
        onClick={onPick}
        aria-label={`add session on ${day.humanDate}`}
        className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[color:var(--color-ink)]/70 transition-colors hover:bg-[color:var(--color-ink)] hover:text-[color:var(--color-canvas)]"
      >
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
          <path d="M7 2v10M2 7h10" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
        </svg>
      </button>
    </div>
  );
}
