/**
 * Access code value generation — cohort-aware.
 *
 * The code string format depends on cohort:
 *
 *   Beta 1 (founding, free for life)
 *     Format: `{LABEL}-FS1`
 *     Examples: `JOELLE-FS1`, `PARTNER-FS1`
 *     Label = uppercased, alphanumeric-only slug of admin-supplied text.
 *     Label is unique across the entire `access_codes` table — including
 *     revoked codes — so revoking a code does NOT free up its label for
 *     reuse. (Matches Beta 2's "increment forever" semantics.)
 *     Suffix lives in `COHORT_CODE_FORMATS.beta_1.suffix` — single source
 *     of truth. Change there, not here.
 *
 *   Beta 2 (paid, $29/mo grandfathered)
 *     Format: `B2-NNN` (3-digit zero-padded sequential number)
 *     Examples: `B2-001`, `B2-007`, `B2-051`
 *     Number = lowest positive integer not currently present in the
 *     `access_codes` table — i.e. gap-filling. Revoked rows still hold
 *     their number (they're not deleted), so revocation does NOT free a
 *     slot. But a hard-DELETE does: the next code generated will reuse
 *     the lowest freed number instead of stepping past it. After number
 *     999 the field widens; 3 digits is a minimum.
 *
 *   Launch (public)
 *     No access code required. Generation is rejected at this layer so
 *     the admin tool can't accidentally produce launch codes.
 *
 * Trainer access at runtime is gated by the `trainers` row's
 * `subscription_status` + `paid_until` (see `src/lib/subscription.ts`
 * `hasStudioAccess`). The access-code string is NOT re-validated per
 * request — it only matters at initial /beta redemption + onboarding
 * bind. So renaming an existing code's `code` value cannot revoke a
 * signed-in trainer's access.
 */
import type { CohortKey } from "@/lib/cohorts";
import { COHORT_CODE_FORMATS } from "@/lib/cohorts";
import type { createSupabaseAdminClient } from "@/lib/supabase/server";

const BETA1_LABEL_MAX_LEN = 16;
const BETA2_PADDING = 3;

// ─── Pure helpers (no DB) ────────────────────────────────────────

/**
 * Sanitize an admin-typed label into the canonical slug used in
 * `{LABEL}-FS1` codes. Strips non-alphanumeric, uppercases,
 * truncates to `BETA1_LABEL_MAX_LEN`. Returns the empty string if
 * nothing usable remains — callers should treat that as an error.
 */
export function sanitizeBeta1Label(raw: string): string {
  return raw.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, BETA1_LABEL_MAX_LEN);
}

export function formatBeta1Code(sanitizedLabel: string): string {
  const fmt = COHORT_CODE_FORMATS.beta_1;
  const suffix = fmt?.kind === "label_dash_suffix" ? fmt.suffix : "FS1";
  return `${sanitizedLabel}-${suffix}`;
}

export function formatBeta2Code(num: number): string {
  const padded = num < 10 ** BETA2_PADDING
    ? String(num).padStart(BETA2_PADDING, "0")
    : String(num);
  return `B2-${padded}`;
}

/**
 * Parse a B2 code back to its number, or null if the string isn't a
 * valid B2-NNN pattern. Used by the next-number computation and by
 * the migration audit.
 */
export function parseBeta2Number(code: string): number | null {
  const m = code.match(/^B2-(\d+)$/);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * True if the given code looks like an OLD-format access code:
 * `LABEL-COHORT-RAND4` (e.g. `SARAH-BETA2-X4K2`).
 * Used by the migration to detect what to rename. Conservative —
 * matches uppercase alphanumeric labels, known cohort slugs in the
 * middle, and 4-char random suffixes from the legacy alphabet.
 */
const LEGACY_PATTERN = /^[A-Z0-9]{1,12}-(BETA1|BETA2|LAUNCH)-[A-Z0-9]{4}$/;
export function isLegacyCodeFormat(code: string): boolean {
  return LEGACY_PATTERN.test(code);
}

// ─── DB-aware generators ─────────────────────────────────────────

// Match the shape returned by `createSupabaseAdminClient` exactly,
// to side-step the moving target of `SupabaseClient`'s generic
// parameters across supabase-js versions.
type Sb = ReturnType<typeof createSupabaseAdminClient>;

/**
 * Find the next Beta 2 number to allocate.
 *
 * Gap-filling: returns the lowest positive integer N for which
 * `B2-{N}` is NOT present in `access_codes`. Includes revoked rows
 * (they hold their number) but a hard-DELETE frees the slot — so if
 * an admin hard-deletes B2-002 and B2-003, the next two generated
 * codes are B2-002 and B2-003, not B2-052.
 *
 * Returns the integer (not the formatted code).
 */
export async function nextBeta2Number(supabase: Sb): Promise<number> {
  const { data: rows, error } = await supabase
    .from("access_codes")
    .select("code")
    .like("code", "B2-%");
  if (error) throw new Error(`access_codes select failed: ${error.message}`);
  const used = new Set<number>();
  for (const r of rows ?? []) {
    const n = parseBeta2Number((r as { code: string }).code);
    if (n !== null) used.add(n);
  }
  // Walk from 1 upward and return the first integer not in `used`.
  // O(n) in the number of existing B2 rows — fine for any realistic
  // beta cohort size. If we ever blow past, say, 10k codes, swap to
  // a sort + linear-scan; until then the set lookup is the simplest
  // thing that works.
  let n = 1;
  while (used.has(n)) n++;
  return n;
}

/**
 * Lookup whether a candidate code string already exists in
 * `access_codes`. Case-insensitive (matches redemption semantics).
 */
async function codeExists(supabase: Sb, code: string): Promise<boolean> {
  const { count, error } = await supabase
    .from("access_codes")
    .select("id", { count: "exact", head: true })
    .ilike("code", code);
  if (error) throw new Error(`access_codes count failed: ${error.message}`);
  return (count ?? 0) > 0;
}

// ─── Top-level entry point ───────────────────────────────────────

export type GenerateArgs =
  | { cohort: "beta_1"; rawLabel: string }
  | { cohort: "beta_2" }
  | { cohort: "launch" }
  | { cohort: string; rawLabel?: string }; // unknown / custom cohorts

export type GenerateResult =
  | { ok: true; code: string; sanitizedLabel: string | null }
  | { ok: false; error: string };

/**
 * Produce the next code value for the given cohort.
 *
 * Beta 1: validates the label is non-empty and unique. Returns the
 * computed code string. Caller does the actual INSERT — keeps this
 * function pure-ish, easier to test.
 *
 * Beta 2: computes the next number, builds the code, returns it.
 * The caller's INSERT may still race with a concurrent generator;
 * the `code` UNIQUE constraint will catch it and the caller should
 * retry by calling this function again.
 *
 * Launch / unknown cohorts: rejected with a clear error.
 */
export async function generateAccessCodeValue(
  supabase: Sb,
  args: GenerateArgs,
): Promise<GenerateResult> {
  if (args.cohort === "launch") {
    return { ok: false, error: "Launch cohort signups don't use access codes." };
  }

  const format = COHORT_CODE_FORMATS[args.cohort as CohortKey];

  if (args.cohort === "beta_1" || format?.kind === "label_dash_suffix") {
    const rawLabel = "rawLabel" in args ? args.rawLabel ?? "" : "";
    const sanitized = sanitizeBeta1Label(rawLabel);
    if (!sanitized) {
      return {
        ok: false,
        error: "Label is required and must contain at least one letter or digit.",
      };
    }
    const suffix = format?.kind === "label_dash_suffix" ? format.suffix : "FS1";
    const code = `${sanitized}-${suffix}`;
    if (await codeExists(supabase, code)) {
      return {
        ok: false,
        error: `Code "${code}" already exists. Try a different label.`,
      };
    }
    return { ok: true, code, sanitizedLabel: sanitized };
  }

  if (args.cohort === "beta_2" || format?.kind === "sequential") {
    const num = await nextBeta2Number(supabase);
    const code = formatBeta2Code(num);
    // No exists-check needed — the number is `max + 1`, but a parallel
    // generator could have allocated it. The caller's INSERT will hit
    // the UNIQUE constraint in that case and is expected to retry by
    // calling us again.
    return { ok: true, code, sanitizedLabel: null };
  }

  return {
    ok: false,
    error: `Unsupported cohort "${args.cohort}". Beta 1 and Beta 2 are the only cohorts that use codes.`,
  };
}
