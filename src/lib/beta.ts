/**
 * Beta-gate cookie name. The cookie value is the literal access-code
 * string (e.g. `JOELLE-FS1`) — same byte-for-byte representation that
 * lives in `public.access_codes.code`.
 *
 * Validation lives in two places, both reading from `access_codes`:
 *   - `src/middleware.ts` — calls the `is_access_code_valid` RPC
 *     (edge-safe, anon-callable, SECURITY DEFINER).
 *   - `src/app/beta/page.tsx` — direct table query via the admin
 *     client (server-side, bypasses RLS).
 *
 * The pre-Beta-2 `BETA_CODES` env-var validator was removed when its
 * silent drift from the DB-backed source of truth caused the
 * middleware ↔ /beta redirect loop. If you need to grandfather a
 * legacy cookie value, do it by inserting a row into `access_codes`
 * — not by reviving the env-var path.
 */
export const BETA_COOKIE = "fs_beta";
