/**
 * Cohorts track how a trainer joined Form Studio. Independent from
 * subscription status — admin can change either without affecting
 * the other.
 *
 * Stored as text on `trainer_subscriptions.cohort` and on
 * `access_codes.cohort`. Adding a new cohort key here is a code
 * change, NOT a DB migration — the column is plain text.
 *
 * Status values produced by `defaultStatus` map to
 * `trainer_subscriptions.status`:
 *   - 'founding' — free forever, never gated by middleware
 *   - 'active'   — paid, paid_until in the future
 *   - 'expired'  — first-time awaiting payment OR past-grace
 *   - 'canceled' — manually canceled
 */
export const COHORTS = {
  beta_1: {
    label: "Beta 1",
    description: "Founding trainers, free for life. Joined via access code.",
    defaultStatus: "founding" as const,
    defaultCadence: null,
    defaultCurrency: null,
  },
  beta_2: {
    label: "Beta 2",
    description: "Grandfathered at $29/mo or AED 109/mo. Pays externally for now.",
    defaultStatus: "expired" as const,
    defaultCadence: "monthly" as const,
    defaultCurrency: "usd" as const,
  },
  launch: {
    label: "Launch",
    description: "Public launch trainers at $39/mo or AED 149/mo.",
    defaultStatus: "expired" as const,
    defaultCadence: "monthly" as const,
    defaultCurrency: "usd" as const,
  },
} as const;

export type CohortKey = keyof typeof COHORTS;
export type SubscriptionStatus = "founding" | "active" | "expired" | "canceled";
export type Cadence = "monthly" | "annual";
export type Currency = "usd" | "aed" | "sar";

export const KNOWN_COHORT_KEYS = Object.keys(COHORTS) as CohortKey[];

export function isKnownCohort(value: string | null | undefined): value is CohortKey {
  return !!value && (KNOWN_COHORT_KEYS as readonly string[]).includes(value);
}

/**
 * Friendly label for a cohort string, including unknown / custom
 * cohorts (which fall back to titlecased value). The admin tool
 * allows typing custom cohorts; this keeps the UI graceful.
 */
export function cohortLabel(value: string | null | undefined): string {
  if (!value) return "—";
  if (isKnownCohort(value)) return COHORTS[value].label;
  // Custom cohort — titlecase and underscore-strip for display
  return value
    .split("_")
    .map((part) => (part ? part[0]!.toUpperCase() + part.slice(1) : part))
    .join(" ");
}
