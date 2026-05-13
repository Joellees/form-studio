import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Read/write helpers for `trainers.onboarding_warning` — the surface
 * text shown on `/studio/onboarding-issue` when the access-code bind
 * step fails recoverably.
 *
 * Why a wrapper instead of direct `.update()`/`.select()`:
 *
 * The column is added by `supabase/migrations/0008_trainers_onboarding_warning.sql`.
 * Migrations on this project aren't applied as part of the Vercel
 * deploy — they're run separately against Supabase. Until 0008 is
 * applied, naive writes/reads on the column would 400 with
 * "column does not exist" (Postgres error code 42703 surfaced by
 * PostgREST). Both helpers detect that case and no-op, which is
 * exactly the right behaviour: pre-migration, "no warning" is the
 * same outcome as never writing one, so the rest of the flow
 * continues without surprise. Post-migration, both helpers behave
 * normally without code change.
 *
 * Keep this file free of Next.js / server-only imports so it can
 * be called from both server actions and server components.
 */

const COLUMN_MISSING_CODE = "42703";
const COLUMN_MISSING_PATTERN = /onboarding_warning/i;

function isColumnMissingError(error: { code?: string | null; message?: string | null }): boolean {
  if (error.code === COLUMN_MISSING_CODE) return true;
  return !!error.message && COLUMN_MISSING_PATTERN.test(error.message);
}

/**
 * Persist (or clear, by passing null) a short human-readable
 * onboarding warning on the trainer row. Soft no-op if the column
 * isn't present yet — logs once for visibility but does not throw.
 */
export async function setOnboardingWarning(
  supabase: SupabaseClient,
  studioId: string,
  message: string | null,
): Promise<void> {
  const { error } = await supabase
    .from("trainers")
    .update({ onboarding_warning: message })
    .eq("id", studioId);

  if (!error) return;
  if (isColumnMissingError(error)) {
    console.warn("onboarding_warning.column_missing_on_write", {
      studioId,
      code: error.code,
      message: error.message,
    });
    return;
  }
  console.error("onboarding_warning.write_failed", {
    studioId,
    code: error.code,
    message: error.message,
  });
}

/**
 * Read the trainer's onboarding warning, if any. Returns null when
 * unset or when the column hasn't been added yet.
 */
export async function getOnboardingWarning(
  supabase: SupabaseClient,
  studioId: string,
): Promise<string | null> {
  const { data, error } = await supabase
    .from("trainers")
    .select("onboarding_warning")
    .eq("id", studioId)
    .maybeSingle();

  if (error) {
    if (isColumnMissingError(error)) return null;
    console.error("onboarding_warning.read_failed", {
      studioId,
      code: error.code,
      message: error.message,
    });
    return null;
  }
  const row = data as { onboarding_warning?: string | null } | null;
  return row?.onboarding_warning ?? null;
}
