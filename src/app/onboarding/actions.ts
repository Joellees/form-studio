"use server";

import { auth, currentUser } from "@clerk/nextjs/server";
import { z } from "zod";

import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { isValidSlug } from "@/lib/tenancy";

const schema = z.object({
  slug: z.string().transform((s) => s.trim().toLowerCase()),
  displayName: z.string().min(1, "Display name is required").max(80),
  bio: z.string().max(500).optional(),
  timezone: z.string().default("UTC"),
});

export type OnboardingResult =
  | { ok: true }
  | { ok: false; field?: "slug" | "displayName" | "bio" | "timezone"; error: string };

/**
 * Claims a subdomain and creates the trainer row. Uses the service-role
 * client because at this moment there is no trainer row yet, so the
 * Clerk-bound RLS policies would reject the insert.
 *
 * Safety: we authorize the caller (signed in Clerk user), then validate,
 * then perform exactly one insert, keyed by Clerk ID. No user-supplied
 * tenant_id or trainer_id is ever trusted.
 */
export async function completeOnboarding(raw: unknown): Promise<OnboardingResult> {
  const { userId } = await auth();
  if (!userId) return { ok: false, error: "You must be signed in." };

  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return { ok: false, field: first?.path[0] as OnboardingResult extends { field: infer F } ? F : never, error: first?.message ?? "Invalid input" };
  }
  const { slug, displayName, bio, timezone } = parsed.data;

  if (!isValidSlug(slug)) {
    return { ok: false, field: "slug", error: "That subdomain isn&rsquo;t available." };
  }

  const user = await currentUser();
  const email = user?.primaryEmailAddress?.emailAddress ?? null;

  const admin = createSupabaseAdminClient();

  // Idempotency: if the trainer row already exists for this Clerk user,
  // treat the onboarding call as a success so reloads don&rsquo;t error out.
  const { data: existing } = await admin
    .from("trainers")
    .select("id")
    .eq("clerk_id", userId)
    .maybeSingle();
  if (existing) return { ok: true };

  const { data: slugClash } = await admin.from("trainers").select("id").eq("subdomain_slug", slug).maybeSingle();
  if (slugClash) {
    return { ok: false, field: "slug", error: "That subdomain is taken." };
  }

  const { data: inserted, error } = await admin
    .from("trainers")
    .insert({
      clerk_id: userId,
      subdomain_slug: slug,
      display_name: displayName,
      bio: bio ?? null,
      email,
      timezone,
      locale: "en",
      subscription_status: "expired",
      subscription_tier: "starter",
    })
    .select("id")
    .single();

  if (error || !inserted) {
    if (error?.code === "23505") {
      return { ok: false, field: "slug", error: "That subdomain is taken." };
    }
    return { ok: false, error: "Could not create your studio. Please try again." };
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
      studioId: inserted.id,
    });
  } catch (err) {
    console.error("onboarding.bind_access_code_failed", err);
    // Don't fail onboarding if the bind fails — the trainer can
    // still sign in and an admin can fix the binding manually.
  }

  return { ok: true };
}
