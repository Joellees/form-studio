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
 * Week grid with click-to-add-session. Day header has weekday, date, and
 * an always-visible + button (no hover-hidden controls, no absolute
 * positioning that can overlap session cards).
 */
export function CalendarWeek({ days, sessionsByDay, clients, workouts }: Props) {
  const [picked, setPicked] = useState<Day | null>(null);

  return (
    <>
      <div className="grid gap-3 md:grid-cols-7">
        {days.map((d) => {
          const sessions = sessionsByDay[d.key] ?? [];
          return (
            <div
              key={d.key}
              className="flex min-h-[4.5rem] flex-col gap-2 rounded-2xl bg-[color:var(--color-parchment)]/55 p-3 md:min-h-[10rem]"
            >
              {/* Header row — weekday name, date number, subtle + button */}
              <div className="flex items-center justify-between">
                <div className="flex items-baseline gap-2">
                  <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[color:var(--color-stone)]">
                    {d.weekday}
                  </span>
                  <span
                    className={cn(
                      "text-base font-semibold tabular-nums tracking-tight md:text-lg",
                      d.isToday
                        ? "text-[color:var(--color-ink)]"
                        : "text-[color:var(--color-ink)]/60",
                    )}
                  >
                    {d.dayNum}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setPicked(d)}
                  aria-label={`add session on ${d.humanDate}`}
                  className="inline-flex h-7 w-7 items-center justify-center rounded-full text-[color:var(--color-ink)]/60 transition-colors hover:bg-[color:var(--color-ink)] hover:text-[color:var(--color-canvas)]"
                >
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
                    <path
                      d="M7 2v10M2 7h10"
                      stroke="currentColor"
                      strokeWidth="1.75"
                      strokeLinecap="round"
                    />
                  </svg>
                </button>
              </div>

              {/* Sessions list, or a clickable empty hint */}
              {sessions.length === 0 ? (
                <button
                  type="button"
                  onClick={() => setPicked(d)}
                  className="flex-1 rounded-xl text-[11px] text-[color:var(--color-stone)]/60 transition-colors hover:text-[color:var(--color-ink)]/70 md:text-xs"
                >
                  <span className="block md:hidden">tap to add</span>
                </button>
              ) : (
                <div className="flex flex-col gap-1.5">
                  {sessions.map((s) => (
                    <SessionRow key={s.id} session={s} variant="card" />
                  ))}
                </div>
              )}
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
