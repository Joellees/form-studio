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
};

type Props = {
  days: Day[];
  sessionsByDay: Record<string, SessionSummary[]>;
  clients: ClientOpt[];
  workouts: { id: string; name: string }[];
};

/**
 * Week grid with click-to-add-session on every day. Hovering a day cell
 * reveals a + control; clicking opens the QuickSchedule popup
 * pre-filled with that day.
 */
export function CalendarWeek({ days, sessionsByDay, clients, workouts }: Props) {
  const [picked, setPicked] = useState<Day | null>(null);

  return (
    <>
      {/* Mobile: stack days vertically; md+: 7-column week grid */}
      <div className="grid gap-3 md:grid-cols-7">
        {days.map((d) => {
          const sessions = sessionsByDay[d.key] ?? [];
          return (
            <div
              key={d.key}
              className="group relative flex min-h-[5rem] flex-col rounded-2xl bg-[color:var(--color-parchment)]/60 p-4 transition-colors hover:bg-[color:var(--color-parchment)] md:min-h-[10rem] md:p-3"
            >
              <button
                type="button"
                onClick={() => setPicked(d)}
                aria-label={`add session on ${d.humanDate}`}
                className="absolute right-2 top-2 inline-flex h-6 w-6 items-center justify-center rounded-full bg-[color:var(--color-ink)] text-[color:var(--color-canvas)] opacity-0 shadow-[0_6px_16px_-6px_rgba(31,30,27,0.45)] transition-opacity hover:bg-[color:var(--color-moss-deep)] group-hover:opacity-100 focus-visible:opacity-100"
              >
                +
              </button>

              <div className="mb-2 flex items-baseline justify-between">
                <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[color:var(--color-stone)]">
                  {d.weekday}
                </span>
                <span
                  className={cn(
                    "text-lg font-semibold tabular-nums tracking-tight",
                    d.isToday ? "text-[color:var(--color-ink)]" : "text-[color:var(--color-ink)]/60",
                  )}
                >
                  {d.dayNum}
                </span>
              </div>

              <div className="flex flex-1 flex-col gap-1.5">
                {sessions.length === 0 ? (
                  <button
                    type="button"
                    onClick={() => setPicked(d)}
                    className="flex-1 rounded-xl text-left text-xs text-[color:var(--color-stone)]/60 transition-colors hover:bg-[color:var(--color-canvas)]/50 hover:text-[color:var(--color-ink)]/70"
                  />
                ) : (
                  sessions.map((s) => <SessionRow key={s.id} session={s} variant="card" />)
                )}
              </div>
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
