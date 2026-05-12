/**
 * Derive a URL-safe slug from a human-typed studio name.
 *
 *   "Joelle"           → "joelle"
 *   "Joelle Estephan"  → "joelleestephan"
 *   "  joelle  "       → "joelle"
 *   "Sarah-Khalil 12"  → "sarahkhalil"
 *
 * Pure, client-and-server safe (no `next/headers`, no `env` deps).
 * The same function runs in the onboarding form (live preview) and in
 * the server action (validation + DB write) so they can never disagree.
 *
 * Rule: lowercase, strip everything that isn't `[a-z]`. No numbers, no
 * dashes, no underscores — trainer URLs are `form-studio.app/{slug}` and
 * we want them to read as a clean handle.
 */
export function deriveSlugFromName(raw: string): string {
  return raw.toLowerCase().replace(/[^a-z]/g, "");
}
