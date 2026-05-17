/**
 * Centralised handling of Postgres / PostgREST / Supabase-SDK error
 * shapes. Two responsibilities:
 *
 *   1. `isMissingColumnError(error, column?)` — detect when a write
 *      failed because the target column doesn't exist (or isn't in
 *      PostgREST's cached schema). Used by defensive try-with-then-
 *      retry-without patterns scattered around the app (packages,
 *      onboarding_warning, source_template_id, etc.) where a recent
 *      migration may not be applied to prod yet.
 *
 *      Why broader than `code === "42703"`: PostgREST returns
 *      different envelopes depending on the request shape.
 *
 *        - On INSERT/UPDATE writes: code = "PGRST204",
 *          message = "Could not find the 'currency' column of
 *                     'packages' in the schema cache"
 *        - On SELECT with unknown column: code = "42703",
 *          message = "column packages.currency does not exist"
 *
 *      The original detector only matched "42703" + "does not exist"
 *      / "undefined" wording — which missed the PGRST204 + "schema
 *      cache" wording entirely. That's the bug that surfaced as
 *      "could not find the 'currency' column of 'packages' in the
 *      schema cache" on /studio/packages/new.
 *
 *   2. `friendlyError(error, doing)` — translate raw DB / network
 *      errors into one-sentence user-facing copy. Never let
 *      Postgres-flavoured strings reach the UI. `doing` is a
 *      present-participle that names what the user was trying to
 *      do; the fallback message reads:
 *
 *        "Something went wrong creating your package. Please try
 *         again or message us if it keeps happening."
 *
 *      The full raw error is `console.error`'d for the dev to find
 *      in server logs.
 */

export type PostgrestErrorShape =
  | {
      code?: string | null;
      message?: string | null;
      hint?: string | null;
      details?: string | null;
    }
  | null
  | undefined;

const SCHEMA_CACHE_PATTERN = /schema cache|does not exist|undefined column|could not find the .* column/i;

export function isMissingColumnError(error: PostgrestErrorShape, column?: string): boolean {
  if (!error) return false;
  /* Postgres-native code for SELECTs (and some writes) */
  if (error.code === "42703") return true;
  /* PostgREST's schema-cache-miss code for INSERT/UPDATE writes */
  if (error.code === "PGRST204") return true;
  /* Fall back to message-shape matching for libraries that don't
   * forward the code field intact. */
  if (!error.message) return false;
  if (!SCHEMA_CACHE_PATTERN.test(error.message)) return false;
  /* If a specific column was named, require it to appear in the
   * message — keeps false positives off. */
  if (column && !new RegExp(`\\b${column}\\b`, "i").test(error.message)) return false;
  return true;
}

/**
 * Turn a raw error into a user-facing one-sentence message. The
 * `doing` phrase is a present-participle ("creating your package",
 * "saving the workout"). Falls through to a generic line for any
 * pattern we don't recognise.
 *
 * Always logs the raw error to console.error so developer diagnosis
 * is unaffected — only the SURFACED text gets sanitised.
 */
export function friendlyError(error: PostgrestErrorShape, doing: string): string {
  if (!error) return genericError(doing);

  /* Developer-side audit trail. Server logs keep the full envelope
   * regardless of what the user sees. */
  console.error("[friendlyError]", {
    doing,
    code: error.code ?? null,
    message: error.message ?? null,
    hint: error.hint ?? null,
    details: error.details ?? null,
  });

  /* Schema cache / missing column — usually means a deploy ran
   * ahead of a migration. Tell the user to try again rather than
   * exposing the column name. */
  if (isMissingColumnError(error)) {
    return "Something on our side needs to update before that can save. Try again in a moment or message us if it sticks.";
  }

  const code = error.code ?? "";
  const message = error.message ?? "";

  /* Unique constraint violation. */
  if (code === "23505") {
    return "That name's already in use. Try a different one.";
  }

  /* Foreign key constraint violation. */
  if (code === "23503") {
    return "Couldn't complete that — please refresh the page and try again.";
  }

  /* NOT NULL violation — usually a form submitted with missing
   * required field, which client-side validation should have
   * caught. Still translate cleanly. */
  if (code === "23502") {
    return "Some required information is missing. Check the highlighted fields.";
  }

  /* Check constraint violation (e.g. price < 0). */
  if (code === "23514") {
    return "One of the values doesn't fit the rules — check what you entered and try again.";
  }

  /* PostgREST-level auth / JWT errors. */
  if (code.startsWith("PGRST3") || /jwt|expired|invalid token|unauthori[sz]ed/i.test(message)) {
    return "Your session expired. Please sign in again.";
  }

  /* Network-y errors from the SDK (no code, "fetch failed", etc.). */
  if (/network|fetch failed|timeout/i.test(message)) {
    return "Network hiccup — check your connection and try again.";
  }

  return genericError(doing);
}

function genericError(doing: string): string {
  return `Something went wrong ${doing}. Please try again or message us if it keeps happening.`;
}
