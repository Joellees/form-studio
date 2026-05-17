import type { Cadence, Currency, SubscriptionStatus } from "@/lib/cohorts";
import { COHORTS, isKnownCohort } from "@/lib/cohorts";

/**
 * Compute the new `paid_until` after a mark-paid action. Extends
 * from the current paid_until if it's in the future, otherwise
 * from `now()` — so a renewal during the grace window doesn't
 * lose the unused tail.
 */
export function extendPaidUntil(
  currentPaidUntil: Date | null,
  cadence: Cadence,
  now: Date = new Date(),
): Date {
  const base =
    currentPaidUntil && currentPaidUntil.getTime() > now.getTime()
      ? currentPaidUntil
      : now;
  const next = new Date(base);
  if (cadence === "annual") {
    next.setFullYear(next.getFullYear() + 1);
  } else {
    next.setMonth(next.getMonth() + 1);
  }
  return next;
}

/**
 * Length of a Beta-2 free trial. The corresponding access code
 * carries `trial_days = 7` in the DB; the gate hard-codes the same
 * length here because seven is the only value the admin UI offers
 * today. If we ever offer other lengths, look up the bound code's
 * `trial_days` at gate time and pass it through instead.
 */
export const TRIAL_LENGTH_DAYS = 7;
const TRIAL_LENGTH_MS = TRIAL_LENGTH_DAYS * 24 * 60 * 60 * 1000;

/**
 * Trial state derived from a trainer's `trial_started_at`. Returns
 * `null` when the trainer never had a trial. Otherwise tells callers
 * both whether the trial is currently active AND how much time is
 * left — the gate, the banner, and the admin row all read this so
 * the timing logic lives in exactly one place.
 */
export type TrialState =
  | null
  | {
      startedAt: Date;
      endsAt: Date;
      msRemaining: number;
      hoursRemaining: number;
      daysRemaining: number;
      active: boolean;
    };

export function trialState(
  trialStartedAt: string | Date | null | undefined,
  now: Date = new Date(),
): TrialState {
  if (!trialStartedAt) return null;
  const startedAt = new Date(trialStartedAt);
  const endsAt = new Date(startedAt.getTime() + TRIAL_LENGTH_MS);
  const msRemaining = endsAt.getTime() - now.getTime();
  /* Ceil for display ("17 hours left" until it really IS zero, so
   * users see 1 instead of 0 for the last hour). The `active` flag
   * is just msRemaining > 0 so the gate sees the same edge clearly. */
  const hoursRemaining = Math.max(0, Math.ceil(msRemaining / (60 * 60 * 1000)));
  const daysRemaining = Math.max(0, Math.ceil(msRemaining / (24 * 60 * 60 * 1000)));
  return {
    startedAt,
    endsAt,
    msRemaining,
    hoursRemaining,
    daysRemaining,
    active: msRemaining > 0,
  };
}

/**
 * Whether the given (status, paid_until, soft_deleted_at,
 * trial_started_at) tuple grants access to /studio/*. Single source
 * of truth — used by middleware AND by server-side route checks
 * (in case a server component reads it before the gate).
 *
 * Order matters:
 *   1. Soft-deleted always denies.
 *   2. Founding cohort always allows.
 *   3. Active subscription within paid_until + 1-day grace allows.
 *   4. Trial window from `trial_started_at` allows. Sits BELOW the
 *      paid-active check so a trainer who paid mid-trial keeps
 *      access via the paid path even after the 7 days elapse.
 *   5. Otherwise deny → routed to /studio/expired.
 */
export function hasStudioAccess(args: {
  status: string | null | undefined;
  paidUntil: string | Date | null | undefined;
  softDeletedAt: string | Date | null | undefined;
  trialStartedAt?: string | Date | null | undefined;
}): boolean {
  if (args.softDeletedAt) return false;
  if (args.status === "founding") return true;
  if (args.status === "active" && args.paidUntil) {
    const expiry = new Date(args.paidUntil);
    // 1-day grace window after paid_until before we treat as expired.
    const cutoff = new Date(expiry.getTime() + 24 * 60 * 60 * 1000);
    if (cutoff.getTime() > Date.now()) return true;
  }
  /* Trial window — gives access during the 7-day trial regardless
   * of subscription_status (which stays `expired` underneath). When
   * the trial ends, this branch returns false and we fall through
   * to the existing /studio/expired redirect. */
  const trial = trialState(args.trialStartedAt);
  if (trial?.active) return true;
  return false;
}

/**
 * Variant of the /studio/expired page the trainer should see.
 * Derived from the trainer + subscription state — keeps the page
 * itself dumb.
 */
export type ExpiredVariant = "first_time" | "expired" | "canceled";

export function expiredVariant(args: {
  status: string | null | undefined;
  lastMarkedPaidAt: string | Date | null | undefined;
}): ExpiredVariant {
  if (args.status === "canceled") return "canceled";
  if (args.lastMarkedPaidAt) return "expired";
  return "first_time";
}

/**
 * Resolve the default status / cadence / currency for a brand-new
 * subscription redeeming a code of the given cohort. Unknown
 * cohorts default to `expired` + monthly + USD so a custom cohort
 * is at least safe.
 */
export function cohortDefaults(cohort: string): {
  status: SubscriptionStatus;
  cadence: Cadence | null;
  currency: Currency | null;
} {
  if (isKnownCohort(cohort)) {
    const c = COHORTS[cohort];
    return {
      status: c.defaultStatus,
      cadence: c.defaultCadence ?? null,
      currency: c.defaultCurrency ?? null,
    };
  }
  return { status: "expired", cadence: "monthly", currency: "usd" };
}

// Access-code value generation lives in `src/lib/access-codes.ts`
// since it's cohort-format-aware and needs a Supabase client to
// look up collisions and the next sequential number. Keeping
// subscription.ts pure (no DB dependencies).
