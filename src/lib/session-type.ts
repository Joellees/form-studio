import { FEATURES } from "./features";

/**
 * Canonical display labels for the three session-delivery values
 * the app uses. Imported everywhere instead of redefined per
 * component, so a renaming touches one place and the whole UI
 * stays consistent.
 *
 * The three labels are deliberately short and lowercase:
 *   - in person
 *   - online
 *   - in-app (only when FEATURES.IN_APP_SESSIONS is enabled)
 *
 * When the in-app feature flag is OFF (Beta 2), legacy sessions
 * with `session_type = 'in_app'` render as `"online"` so the UI
 * doesn't expose the paused option. Session-detail pages call
 * `isLegacyInApp()` to show a small explanatory note next to
 * those specific rows.
 */
export type SessionTypeValue = "in_person" | "zoom" | "in_app";

export function prettySessionType(t: SessionTypeValue): string {
  if (t === "in_person") return "in person";
  if (t === "zoom") return "online";
  // `in_app` only shows as itself when the feature is enabled.
  // While disabled it falls back to "online" so legacy rows in the
  // DB don't expose the paused option label across the app.
  if (FEATURES.IN_APP_SESSIONS) return "in-app";
  return "online";
}

/**
 * True when a session has `session_type = 'in_app'` AND the in-app
 * feature is currently disabled — i.e. a legacy seed/test row from
 * before Beta 2 paused the feature. Used to render a small
 * explanatory note on session-detail pages without leaking the
 * label everywhere.
 */
export function isLegacyInApp(t: SessionTypeValue): boolean {
  return t === "in_app" && !FEATURES.IN_APP_SESSIONS;
}
