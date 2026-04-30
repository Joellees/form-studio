/**
 * Friendly display for IANA timezones. Trainers and clients don't
 * read "Asia/Dubai" — they read "Dubai." We strip the continent
 * prefix and tidy up the city/country segment.
 *
 * Examples:
 *   "Asia/Dubai"        -> "Dubai"
 *   "America/New_York"  -> "New York"
 *   "Europe/London"     -> "London"
 *   "Africa/Casablanca" -> "Casablanca"
 *   "UTC"               -> "UTC"
 */
export function prettyTimezone(tz: string | null | undefined): string {
  if (!tz) return "UTC";
  const segments = tz.split("/");
  const last = segments.length > 1 ? segments[segments.length - 1] : segments[0];
  return (last ?? tz).replaceAll("_", " ");
}
