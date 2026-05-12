/**
 * Clerk Backend API helpers — direct REST, no SDK dependency surface.
 *
 * Auth: `CLERK_SECRET_KEY` (server-only). Already validated by env.ts at
 * boot, so we trust it's set when this file is reached.
 */

const CLERK_API_BASE = "https://api.clerk.com/v1";

export type ClerkDeleteResult =
  | { ok: true; alreadyGone?: boolean }
  | { ok: false; error: string; status?: number };

/**
 * Delete a Clerk user by ID. Idempotent: a 404 ("user not found") is
 * treated as success, because the goal — "ensure this user doesn't exist
 * in Clerk" — is satisfied either way.
 *
 * Called from `hardDeleteTrainer` (and only there, currently). If a new
 * caller appears, keep the idempotency guarantee — admin actions are
 * often re-run after partial failures.
 */
export async function deleteClerkUser(clerkUserId: string): Promise<ClerkDeleteResult> {
  const secret = process.env.CLERK_SECRET_KEY;
  if (!secret) {
    return { ok: false, error: "CLERK_SECRET_KEY not configured on the server" };
  }
  if (!clerkUserId) {
    return { ok: false, error: "empty clerk user id" };
  }

  let res: Response;
  try {
    res = await fetch(`${CLERK_API_BASE}/users/${encodeURIComponent(clerkUserId)}`, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${secret}`,
        "Content-Type": "application/json",
      },
    });
  } catch (err) {
    return {
      ok: false,
      error: `Clerk API unreachable: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  if (res.ok) return { ok: true };

  if (res.status === 404) {
    // User doesn't exist — same end state as "we just deleted them".
    return { ok: true, alreadyGone: true };
  }

  // Try to surface Clerk's structured error body if there is one.
  let body = "";
  try {
    body = await res.text();
  } catch {
    // ignore
  }
  return {
    ok: false,
    status: res.status,
    error: `Clerk delete failed (HTTP ${res.status})${body ? `: ${body.slice(0, 200)}` : ""}`,
  };
}
