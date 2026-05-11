/**
 * Feature flags for Form Studio.
 *
 * Flip a flag to `true` when the corresponding feature is ready to
 * ship. Wrap every UI surface for a flagged feature in
 * `if (FEATURES.X)` guards — don't conditionally import flagged
 * code, that breaks tree-shaking and makes re-enabling messy.
 *
 * Read the comments on each flag before flipping. They describe the
 * dependencies that need to be in place first.
 */
export const FEATURES = {
  /**
   * In-app sessions and the $3 per-session fee flow.
   *
   * Disabled for Beta 2 — re-enables when Stripe is integrated.
   *
   * When this flips to `true`, the following resurface across the
   * app (the code already exists, just gated):
   *
   *   - "In-app" option in the trainer's session-type pickers
   *     (calendar quick-schedule, schedule-form, inline session
   *     row, session-type editor).
   *   - The trainer dashboard's `in_app_upgrade` action-feed row
   *     (currently the loop skips this branch).
   *   - The client portal's "request extra workout · $3" CTA and
   *     the ExtraInAppDialog confirm modal.
   *   - The +$3 badge on `client_requested` in-app session cards.
   *   - The `requestExtraInAppSession` server action (currently
   *     rejects with a clear error at the top).
   *
   * The `session_type` enum in Supabase still includes `'in_app'`
   * intentionally — re-enabling is a flag flip, not a migration.
   * Legacy seed data with `session_type = 'in_app'` is rendered as
   * "online" with a small explanatory note on session-detail pages.
   *
   * See `BETA_2_DEFERRED.md` at the repo root for the full
   * re-enable checklist (per-session override affordance, monthly
   * batch tracking, etc.).
   */
  IN_APP_SESSIONS: false,
} as const;

export type FeatureFlag = keyof typeof FEATURES;
