/**
 * Pricing constants surfaced in both server actions and client UI.
 * Lives outside any "use server" file so client components can
 * import the values directly (Next.js disallows non-async exports
 * from server-action modules).
 */

import type { Cadence, CohortKey, Currency } from "./cohorts";

/**
 * What the client pays for one client-requested extra in-app
 * workout, on top of their package. Trainer-pushed in-app workouts
 * (which deduct from the package count) are free. Currently gated
 * behind FEATURES.IN_APP_SESSIONS in `lib/features.ts`.
 */
export const EXTRA_INAPP_PRICE_USD = 3;

/**
 * Single source of truth for trainer-platform pricing across cohorts
 * + cadences + currencies. Used by:
 *   - admin "Mark paid" modal (computed amount display)
 *   - /studio/expired card (plan summary)
 *   - Excel export (revenue snapshot)
 *
 * AED / SAR rounded to clean local numbers, not direct USD
 * conversion. Trainer's chosen currency is locked once a
 * subscription exists (Stripe doesn't migrate currencies on
 * existing subs — when Stripe lands, this rule matters).
 *
 * Beta 1 has no entry: founders are free for life.
 */
export const PRICING = {
  beta_2: {
    monthly: { usd: 29, aed: 109, sar: 109 },
    annual: { usd: 290, aed: 1090, sar: 1090 },
  },
  launch: {
    monthly: { usd: 39, aed: 149, sar: 149 },
    annual: { usd: 390, aed: 1490, sar: 1490 },
  },
} as const;

export type PricedCohort = "beta_2" | "launch";

export function isPricedCohort(cohort: string | null | undefined): cohort is PricedCohort {
  return cohort === "beta_2" || cohort === "launch";
}

export function getPrice(
  cohort: CohortKey | string,
  cadence: Cadence,
  currency: Currency,
): number | null {
  if (!isPricedCohort(cohort)) return null;
  return PRICING[cohort][cadence][currency];
}

/**
 * Format an amount + currency as a user-facing string. Used wherever
 * a price is rendered: admin modals, /studio/expired card, Excel.
 *
 *   usd → "$29" / "$290"
 *   aed → "AED 109" / "AED 1,090"
 *   sar → "SAR 109" / "SAR 1,090"
 */
export function formatPrice(amount: number, currency: Currency | string): string {
  const cur = (currency ?? "usd").toLowerCase();
  const formatted = amount >= 1000 ? amount.toLocaleString("en-US") : String(amount);
  if (cur === "usd") return `$${formatted}`;
  if (cur === "aed") return `AED ${formatted}`;
  if (cur === "sar") return `SAR ${formatted}`;
  return `${currency.toUpperCase()} ${formatted}`;
}

/**
 * Region → default currency for new subscriptions.
 *   lb (Lebanon) → USD (no native LBP support)
 *   ae (UAE) → AED
 *   sa / kw (Saudi / Kuwait) → SAR
 *   anything else → USD
 */
export function defaultCurrencyForRegion(region: string | null | undefined): Currency {
  const r = (region ?? "").toLowerCase();
  if (r === "ae") return "aed";
  if (r === "sa" || r === "kw") return "sar";
  return "usd";
}
