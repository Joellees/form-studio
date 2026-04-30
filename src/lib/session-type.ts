/**
 * Canonical display labels for the three session-delivery values
 * the app uses. Imported everywhere instead of redefined per
 * component, so a renaming touches one place and the whole UI
 * stays consistent.
 *
 * The three labels are deliberately short and lowercase:
 *   - in person
 *   - online
 *   - in-app
 */
export type SessionTypeValue = "in_person" | "zoom" | "in_app";

export function prettySessionType(t: SessionTypeValue): string {
  if (t === "in_person") return "in person";
  if (t === "zoom") return "online";
  return "in-app";
}
