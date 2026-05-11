import { env } from "@/lib/env";

/**
 * Single source of truth for every URL the app surfaces — invite
 * links, public profile links, copy in emails, canonical tags,
 * WhatsApp prefill messages. Reads from `NEXT_PUBLIC_APP_URL` so
 * the domain is one env-var change away.
 *
 * Never hardcode the domain anywhere else. Grep for
 * `form-studio.app` outside this file and `DOMAIN_SETUP.md` and
 * route the call site through one of these helpers instead.
 */

/**
 * Canonical absolute origin (no trailing slash). The default falls
 * back to the Vercel preview URL when `NEXT_PUBLIC_APP_URL` is
 * unset, so local dev / preview builds still produce reachable
 * links.
 */
export function getCanonicalUrl(): string {
  const raw = env.NEXT_PUBLIC_APP_URL || "https://form-studio.app";
  return raw.replace(/\/$/, "");
}

/**
 * Bare hostname (no protocol, no path) — for places that render the
 * URL as user-facing text rather than as a clickable link.
 *   getDisplayDomain() → "form-studio.app"
 */
export function getDisplayDomain(): string {
  try {
    return new URL(getCanonicalUrl()).host;
  } catch {
    return "form-studio.app";
  }
}

export function getStudioUrl(): string {
  return `${getCanonicalUrl()}/studio`;
}

export function getBetaGateUrl(next?: string): string {
  const base = `${getCanonicalUrl()}/beta`;
  if (!next) return base;
  return `${base}?next=${encodeURIComponent(next)}`;
}

/**
 * Public trainer profile (path-based, e.g. /s/joelle). The earlier
 * subdomain model (`joelle.formstudio.com`) is preserved in the
 * middleware rewrite but is not used by any link generator —
 * everything links to the path-based version.
 */
export function getTrainerProfileUrl(handle: string): string {
  return `${getCanonicalUrl()}/s/${handle}`;
}

export function getInviteUrl(token: string): string {
  return `${getCanonicalUrl()}/invite/${token}`;
}

/**
 * Sign-in URL used by emailed reminders + the client portal
 * welcome banner ("bookmark this to come back"). Apex sign-in
 * works for any trainer + client tenant.
 */
export function getSignInUrl(): string {
  return `${getCanonicalUrl()}/sign-in`;
}

/**
 * Build a `/beta/unlock?code=…` one-shot link. Used in the admin
 * "copy with WhatsApp message" affordance + anywhere we share an
 * access code with a trainer / tester.
 */
export function getUnlockUrl(code: string): string {
  return `${getCanonicalUrl()}/beta/unlock?code=${encodeURIComponent(code)}`;
}
