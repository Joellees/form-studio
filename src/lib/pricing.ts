/**
 * Pricing constants surfaced in both server actions and client UI.
 * Lives outside any "use server" file so client components can import
 * the values directly (Next.js disallows non-async exports from
 * server-action modules).
 */

/**
 * What the client pays for one client-requested extra in-app workout,
 * on top of their package. Trainer-pushed in-app workouts (which
 * deduct from the package count) are free. See spec for the model.
 */
export const EXTRA_INAPP_PRICE_USD = 3;
