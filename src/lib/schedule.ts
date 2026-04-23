import { addDays, endOfWeek, startOfDay, startOfWeek } from "date-fns";
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
