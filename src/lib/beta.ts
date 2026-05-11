/**
 * Beta gate — the cookie name + the legacy env-var parser.
 *
 * Beta-2 phase: the `BETA_CODES` env var is deprecated. Codes now
 * live in `public.access_codes`. Middleware accepts the cookie if
 * its value matches a live (non-revoked) access_codes row OR if it
 * matches the legacy env-var list (kept temporarily for browsers
 * that have the old cookie set and haven't re-redeemed yet).
 *
 * Server-side validation against the DB happens in
 * `validateBetaCookieAgainstDb` — middleware (edge) can't query
 * Supabase synchronously, so this helper is called from server
 * components that need a fresh check.
 */

export type BetaCode = { code: string; label: string };

export const BETA_COOKIE = "fs_beta";

/**
 * Legacy parser for the `BETA_CODES` env var. Kept for backward
 * compatibility — existing browsers with cookies set during the
 * env-var era keep working until their next redemption. New
 * trainers go through the DB-backed access_codes flow.
 */
export function parseBetaCodes(raw: string | undefined): BetaCode[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const [code, ...labelParts] = entry.split(":");
      return { code: code!.trim(), label: labelParts.join(":").trim() || code!.trim() };
    })
    .filter((c) => c.code.length > 0);
}

export function isValidBetaCode(code: string, codes: BetaCode[]): BetaCode | null {
  const match = codes.find((c) => c.code.toLowerCase() === code.toLowerCase().trim());
  return match ?? null;
}
