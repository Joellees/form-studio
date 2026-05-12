"use server";

import { auth, currentUser } from "@clerk/nextjs/server";
import { z } from "zod";

import { deriveSlugFromName } from "@/lib/slug";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { RESERVED_SLUGS } from "@/lib/tenancy";

const schema = z.object({
  studioName: z.string().trim().min(1, "Pick a name to continue").max(80),
  bio: z.string().max(500, "Keep it under 500 characters.").optional(),
  timezone: z.string().default("UTC"),
});

const MAX_SLUG_SUFFIX_TRIES = 100;

export type OnboardingResult =
  | { ok: true }
  | { ok: false; field?: "studioName" | "bio" | "timezone"; error: string };

/**
 * Creates the trainer row from the single studio-name input.
 *
 *   - The base URL slug is derived server-side via `deriveSlugFromName`
 *     (lowercase + strip non-letters). The client form uses the same
 *     function for its live preview so what's shown is what gets stored
 *     — modulo a numeric suffix if the slug collides.
 *   - On slug collision, we auto-suffix: `joelle` → `joelle2` → `joelle3`
 *     etc. (up to 100 attempts). `display_name` always stays the raw
 *     typed value — only the URL slug gets suffixed, transparently to
 *     the trainer. Two "Joelles" both see "Joelle's Form Studio" but
 *     live at different URLs.
 *   - Reserved slugs (admin, api, www, …) are rejected outright — no
 *     auto-suffix. The trainer is asked to pick a different name.
 *   - Race-safety: the slug allocation uses INSERT + retry-on-UNIQUE-
 *     violation rather than a check-then-insert. Two concurrent signups
 *     for "joelle" cannot both get the same slug — Postgres's UNIQUE
 *     constraint on `trainers.subdomain_slug` enforces it, and we
 *     simply retry with the next suffix.
 *   - `subdomain_slug` is the storage column; the name is legacy
 *     (predates the path-based migration) but it's still the canonical
 *     handle source consumed by `/s/[slug]` routing.
 *
 * Uses the service-role client because at this moment there is no
 * trainer row yet, so the Clerk-bound RLS policies would reject the
 * insert. Safety: authorize the caller (signed-in Clerk user), validate,
 * then perform exactly one insert keyed by Clerk ID. No user-supplied
 * tenant_id or trainer_id is ever trusted.
 */
export async function completeOnboarding(raw: unknown): Promise<OnboardingResult> {
  const { userId } = await auth();
  if (!userId) return { ok: false, error: "You must be signed in." };

  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return {
      ok: false,
      field: first?.path[0] as OnboardingResult extends { field: infer F } ? F : never,
      error: first?.message ?? "Invalid input",
    };
  }
  const { studioName, bio, timezone } = parsed.data;

  // Derive the BASE URL slug. The client form's preview uses the same
  // function. Reserved + length checks happen on the base only — the
  // numeric suffix never lands us on a reserved word (none of them end
  // in digits) so the suffixed candidates only need DB-uniqueness.
  const baseSlug = deriveSlugFromName(studioName);
  if (baseSlug.length < 3) {
    return {
      ok: false,
      field: "studioName",
      error: "Use a name with at least 3 letters.",
    };
  }
  if (baseSlug.length > 32) {
    return {
      ok: false,
      field: "studioName",
      error: "That name is too long — keep the letter count under 32.",
    };
  }
  if (RESERVED_SLUGS.has(baseSlug)) {
    return {
      ok: false,
      field: "studioName",
      error: "That's a reserved name — try a different one.",
    };
  }
  if (!/^[a-z]+$/.test(baseSlug)) {
    // Defensive — deriveSlugFromName already strips non-letters, so this
    // branch shouldn't fire under normal flow. Kept so future refactors
    // can't sneak invalid characters through.
    return {
      ok: false,
      field: "studioName",
      error: "Use letters only.",
    };
  }

  const user = await currentUser();
  const email = user?.primaryEmailAddress?.emailAddress ?? null;

  const admin = createSupabaseAdminClient();

  // Idempotency: if the trainer row already exists for this Clerk user,
  // treat the onboarding call as a success so reloads don't error out.
  const { data: existing } = await admin
    .from("trainers")
    .select("id")
    .eq("clerk_id", userId)
    .maybeSingle();
  if (existing) return { ok: true };

  // Auto-suffix loop. INSERT with `subdomain_slug = candidate`; on the
  // UNIQUE-violation error code 23505 we step the suffix and retry. The
  // first attempt uses the bare slug, then `<slug>2`, `<slug>3`, …
  // Race-safe by construction — two concurrent inserts on the same slug
  // can never both succeed because the column is UNIQUE.
  let insertedId: string | null = null;
  let finalSlug: string = baseSlug;
  let lastErrorMessage: string | null = null;
  for (let attempt = 0; attempt < MAX_SLUG_SUFFIX_TRIES; attempt++) {
    const candidate = attempt === 0 ? baseSlug : `${baseSlug}${attempt + 1}`;
    const { data, error } = await admin
      .from("trainers")
      .insert({
        clerk_id: userId,
        subdomain_slug: candidate,
        display_name: studioName,
        bio: bio ?? null,
        email,
        timezone,
        locale: "en",
        subscription_status: "expired",
        subscription_tier: "starter",
      })
      .select("id")
      .single();

    if (!error && data) {
      insertedId = data.id;
      finalSlug = candidate;
      break;
    }

    lastErrorMessage = error?.message ?? null;

    if (error?.code === "23505") {
      // Postgres unique violation. Two unique constraints exist on this
      // table: `subdomain_slug` and `clerk_id`. Distinguish them.
      const msg = `${error.message ?? ""} ${error.details ?? ""}`;
      if (msg.includes("subdomain_slug")) {
        // Slug collision — step the suffix and retry.
        continue;
      }
      if (msg.includes("clerk_id")) {
        // Race against our own session (extremely unlikely given the
        // idempotency check above). Re-fetch and return success.
        const { data: existingRetry } = await admin
          .from("trainers")
          .select("id")
          .eq("clerk_id", userId)
          .maybeSingle();
        if (existingRetry) return { ok: true };
      }
    }

    // Non-retryable error — bail.
    return { ok: false, error: "Could not create your studio. Please try again." };
  }

  if (!insertedId) {
    return {
      ok: false,
      field: "studioName",
      error: `That name has lots of variants taken (we tried up to ${MAX_SLUG_SUFFIX_TRIES}). Try adding your last name.`,
    };
  }

  // Helps post-mortem if someone hits the suffix path repeatedly.
  if (finalSlug !== baseSlug) {
    console.info("onboarding.slug_auto_suffixed", {
      clerkUserId: userId,
      baseSlug,
      finalSlug,
      attempts: Number(finalSlug.slice(baseSlug.length)) - 1,
    });
  }
  if (lastErrorMessage && finalSlug !== baseSlug) {
    void lastErrorMessage; // referenced for future logging hooks
  }

  // Beta-2 access-code redemption. Reads the `fs_beta` cookie set
  // when the trainer entered their code at /beta, looks up the
  // matching row in `public.access_codes`, binds it to this new
  // studio + Clerk user, and seeds the trainer_subscription row
  // with the cohort defaults. Silent no-op if no cookie or the
  // code is bound to a different user — middleware would have
  // bounced them out before this point under normal flow.
  try {
    const { bindAccessCodeOnOnboarding } = await import("@/app/beta/actions");
    await bindAccessCodeOnOnboarding({
      clerkUserId: userId,
      studioId: insertedId,
    });
  } catch (err) {
    console.error("onboarding.bind_access_code_failed", err);
    // Don't fail onboarding if the bind fails — the trainer can
    // still sign in and an admin can fix the binding manually.
  }

  return { ok: true };
}
