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
 * Whether the given (status, paid_until, soft_deleted_at) triple
 * grants access to /studio/*. Single source of truth — used by
 * middleware AND by server-side route checks (in case a server
 * component reads it before the gate).
 */
export function hasStudioAccess(args: {
  status: string | null | undefined;
  paidUntil: string | Date | null | undefined;
  softDeletedAt: string | Date | null | undefined;
}): boolean {
  if (args.softDeletedAt) return false;
  if (args.status === "founding") return true;
  if (args.status !== "active") return false;
  if (!args.paidUntil) return false;
  const expiry = new Date(args.paidUntil);
  // 1-day grace window after paid_until before we treat as expired.
  const cutoff = new Date(expiry.getTime() + 24 * 60 * 60 * 1000);
  return cutoff.getTime() > Date.now();
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

/**
 * Generate an access code following the documented pattern:
 *   <LABEL>-<COHORT>-<RANDOM4>
 * e.g. SARAH-BETA2-X4K2.
 *
 * LABEL = uppercase alphanumeric slug of the human label (max 12
 * chars so the full code stays readable).
 * COHORT = BETA1 / BETA2 / LAUNCH / fallback to uppercased cohort.
 * RANDOM4 = 4 chars from an unambiguous alphabet (no 0/O/1/I to
 * keep handed-over codes legible).
 */
const RANDOM_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function buildAccessCode(label: string, cohort: string): string {
  const labelSlug =
    label
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, "")
      .slice(0, 12) || "CODE";
  const cohortSlug = cohort.toUpperCase().replace(/[^A-Z0-9]/g, "");
  let random = "";
  for (let i = 0; i < 4; i++) {
    random += RANDOM_ALPHABET[Math.floor(Math.random() * RANDOM_ALPHABET.length)];
  }
  return `${labelSlug}-${cohortSlug}-${random}`;
}
