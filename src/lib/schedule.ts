import {
  addDays,
  endOfMonth,
  endOfWeek,
  startOfDay,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import { formatInTimeZone, fromZonedTime } from "date-fns-tz";

/**
 * Cancellation cutoff: client can cancel any time before midnight (local to
 * the trainer) of the day BEFORE the session. Trainer can always cancel.
 *
 * Returns the exact UTC cutoff as a Date so callers can compare `new Date()`
 * against it without re-deriving timezone math.
 */
export function clientCancellationCutoff(scheduledAtUtc: Date, trainerTimezone: string): Date {
  const dayStartLocal = formatInTimeZone(scheduledAtUtc, trainerTimezone, "yyyy-MM-dd");
  // Midnight of the session day in trainer tz, as a UTC Date.
  const sessionDayMidnightUtc = fromZonedTime(`${dayStartLocal}T00:00:00`, trainerTimezone);
  return sessionDayMidnightUtc;
}

export function canClientCancel(scheduledAtUtc: Date, trainerTimezone: string, now: Date = new Date()): boolean {
  return now < clientCancellationCutoff(scheduledAtUtc, trainerTimezone);
}

export function weekRange(referenceDate: Date, timezone: string): { start: Date; end: Date; days: Date[] } {
  // Anchor the week to the trainer's local "Monday" rather than UTC.
  const localISO = formatInTimeZone(referenceDate, timezone, "yyyy-MM-dd");
  const localMidnight = fromZonedTime(`${localISO}T00:00:00`, timezone);
  const weekStart = startOfWeek(localMidnight, { weekStartsOn: 1 });
  const weekEnd = endOfWeek(localMidnight, { weekStartsOn: 1 });
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  return { start: startOfDay(weekStart), end: weekEnd, days };
}

export function formatInTz(date: Date, timezone: string, pattern: string): string {
  return formatInTimeZone(date, timezone, pattern);
}

/**
 * N consecutive weeks starting at the trainer-local Monday of the
 * referenced week. Used by the 2-weeks view (n=2) — for a 4-week
 * "month-ish" the dedicated month grid is more correct since it
 * aligns to month boundaries.
 */
export function multiWeekRange(
  referenceDate: Date,
  timezone: string,
  weeks: number,
): { start: Date; end: Date; days: Date[] } {
  const { start } = weekRange(referenceDate, timezone);
  const days = Array.from({ length: weeks * 7 }, (_, i) => addDays(start, i));
  const end = endOfWeek(addDays(start, (weeks - 1) * 7), { weekStartsOn: 1 });
  return { start, end, days };
}

/**
 * Calendar-month grid: starts on the Monday on/before the first of
 * the month and runs through the Sunday on/after the last of the
 * month. The result is always a multiple of 7 (typically 35 or 42)
 * so a 7-column grid renders cleanly without orphan cells.
 */
export function monthGridRange(
  referenceDate: Date,
  timezone: string,
): { start: Date; end: Date; days: Date[]; monthStart: Date; monthEnd: Date } {
  const localISO = formatInTimeZone(referenceDate, timezone, "yyyy-MM-dd");
  const localMidnight = fromZonedTime(`${localISO}T00:00:00`, timezone);
  const monthStart = startOfMonth(localMidnight);
  const monthEnd = endOfMonth(localMidnight);
  const gridStart = startOfWeek(monthStart, { weekStartsOn: 1 });
  const gridEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });
  const dayCount = Math.round((gridEnd.getTime() - gridStart.getTime()) / 86400_000) + 1;
  const days = Array.from({ length: dayCount }, (_, i) => addDays(gridStart, i));
  return {
    start: startOfDay(gridStart),
    end: gridEnd,
    days,
    monthStart,
    monthEnd,
  };
}
