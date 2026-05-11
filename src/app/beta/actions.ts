"use server";

import { auth } from "@clerk/nextjs/server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";

import { type ActionResult, fail, ok, runAction } from "@/lib/actions";
import { BETA_COOKIE } from "@/lib/beta";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { cohortDefaults } from "@/lib/subscription";

/**
 * Beta-2 access-code redemption.
 *
 * Single funnel for everyone entering Form Studio in the pre-Stripe
 * phase. Three branches, gated by Clerk session + DB binding:
 *
 *   first redemption (code unbound)
 *     → bind code to this Clerk user
 *     → cookie is set
 *     → on subsequent /studio access, signup flow creates the
 *       studio + trainer_subscription with cohort defaults
 *
 *   returning trainer (code bound to *this* Clerk user)
 *     → idempotent: cookie set, soft_deleted_at cleared on the
 *       bound studio, redemption_count++
 *
 *   wrong owner (code bound to *another* Clerk user)
 *     → rejected
 *
 * The `BETA_CODES` env-var system is deprecated by this — every
 * code is now a row in `public.access_codes` with a stable id and
 * audit trail. The `fs_beta` cookie value is the code string,
 * unchanged, so existing browser sessions keep working.
 */
const enterSchema = z.object({
  code: z.string().min(3).max(80),
  next: z.string().optional(),
});

export async function enterBeta(formData: FormData): Promise<void> {
  const raw = {
    code: String(formData.get("code") ?? "").trim(),
    next: String(formData.get("next") ?? "/"),
  };
  const result = await redeemAccessCodeInternal(raw);
  if (!result.ok) {
    const next = raw.next || "/";
    redirect(`/beta?error=1&next=${encodeURIComponent(next)}`);
  }
  redirect(raw.next || "/");
}

/**
 * Same redemption logic, callable from JSON-RPC-style server
 * actions (e.g. the unlock route). Returns an ActionResult instead
 * of redirecting so the caller controls navigation.
 */
export async function redeemAccessCode(raw: unknown): Promise<ActionResult<{ code: string }>> {
  return redeemAccessCodeInternal(raw);
}

async function redeemAccessCodeInternal(
  raw: unknown,
): Promise<ActionResult<{ code: string }>> {
  return runAction(enterSchema, raw, async ({ code }) => {
    const supabase = createSupabaseAdminClient();
    const { userId } = await auth();

    // Codes are stored case-insensitively at write time (preserved
    // verbatim, but matched without case). This avoids the
    // SARAH-BETA2-X4K2 / sarah-beta2-x4k2 mismatch that confuses
    // trainers pasting from messages.
    const { data: codeRow } = await supabase
      .from("access_codes")
      .select(
        "id, code, cohort, revoked, bound_to_clerk_user_id, bound_to_studio_id, redemption_count",
      )
      .ilike("code", code)
      .maybeSingle();

    if (!codeRow) {
      console.warn("access_code.redeem.not_found", { code });
      return fail("This access code isn't valid.");
    }
    if (codeRow.revoked) {
      console.warn("access_code.redeem.revoked", { code: codeRow.code });
      return fail("This access code is no longer valid.");
    }

    // Wrong owner: bound to another Clerk user.
    if (
      codeRow.bound_to_clerk_user_id &&
      userId &&
      codeRow.bound_to_clerk_user_id !== userId
    ) {
      console.warn("access_code.redeem.wrong_owner", {
        code: codeRow.code,
        attemptedBy: userId,
      });
      return fail("This access code has already been claimed.");
    }

    // Set the cookie regardless of whether we can finalize binding
    // here — the binding completes at onboarding-time when the
    // Clerk user lands with a session, but the cookie is what gets
    // them past the middleware gate in the meantime.
    const jar = await cookies();
    jar.set(BETA_COOKIE, codeRow.code, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
    });

    // Three branches:
    //   1. Returning trainer (signed in, code bound to them) → restore
    //   2. First redemption with Clerk session active → bind + record
    //   3. First redemption with no Clerk session yet → just cookie
    //      it; binding completes during onboarding-claim
    if (
      userId &&
      codeRow.bound_to_clerk_user_id === userId &&
      codeRow.bound_to_studio_id
    ) {
      // Soft-delete restore: clear the marker so middleware lets
      // them back into /studio/*. Their existing trainer_subscription
      // status is preserved (founding/active/expired/canceled).
      await supabase
        .from("trainers")
        .update({ soft_deleted_at: null })
        .eq("id", codeRow.bound_to_studio_id);

      await supabase
        .from("access_codes")
        .update({
          redemption_count: codeRow.redemption_count + 1,
          last_redeemed_at: new Date().toISOString(),
        })
        .eq("id", codeRow.id);
      await supabase.from("access_code_events").insert({
        access_code_id: codeRow.id,
        event_type: "redeemed_return",
        clerk_user_id: userId,
      });

      const { data: subRow } = await supabase
        .from("trainer_subscriptions")
        .select("id, status")
        .eq("studio_id", codeRow.bound_to_studio_id)
        .maybeSingle();
      if (subRow) {
        await supabase.from("trainer_subscription_events").insert({
          trainer_subscription_id: subRow.id,
          studio_id: codeRow.bound_to_studio_id,
          event_type: "restored",
          from_status: subRow.status,
          to_status: subRow.status,
          clerk_user_id: userId,
        });
      }

      console.info("access_code.redeem.return", {
        code: codeRow.code,
        userId,
        studioId: codeRow.bound_to_studio_id,
      });
      return ok({ code: codeRow.code });
    }

    if (userId && !codeRow.bound_to_clerk_user_id) {
      // First redemption — bind the code to this Clerk user. The
      // studio_id is filled in later when the trainer completes
      // onboarding (we don't have a studio row yet). Audit row
      // records the bind so the trail is complete.
      await supabase
        .from("access_codes")
        .update({
          bound_to_clerk_user_id: userId,
          redemption_count: codeRow.redemption_count + 1,
          last_redeemed_at: new Date().toISOString(),
        })
        .eq("id", codeRow.id);
      await supabase.from("access_code_events").insert({
        access_code_id: codeRow.id,
        event_type: "redeemed_first_time",
        clerk_user_id: userId,
      });
      console.info("access_code.redeem.first_time", {
        code: codeRow.code,
        userId,
      });
      return ok({ code: codeRow.code });
    }

    // Pre-signup: signed-out visitor entering the code at /beta.
    // Cookie is already set above; the binding completes when
    // onboarding finalizes (see `bindAccessCodeOnOnboarding`).
    console.info("access_code.redeem.pre_signup", { code: codeRow.code });
    return ok({ code: codeRow.code });
  });
}

/**
 * Called from the onboarding-completion action. Looks at the
 * caller's `fs_beta` cookie, finds the access code, binds it to
 * the freshly-created studio + Clerk user, and seeds the
 * trainer_subscription row with the cohort's defaults.
 *
 * Idempotent: if the code is already bound and the
 * trainer_subscription already exists, returns ok silently.
 */
export async function bindAccessCodeOnOnboarding(args: {
  clerkUserId: string;
  studioId: string;
}): Promise<void> {
  const supabase = createSupabaseAdminClient();
  const jar = await cookies();
  const cookieCode = jar.get(BETA_COOKIE)?.value;
  if (!cookieCode) {
    console.warn("access_code.bind.no_cookie", {
      userId: args.clerkUserId,
      studioId: args.studioId,
    });
    return;
  }
  const { data: codeRow } = await supabase
    .from("access_codes")
    .select("id, code, cohort, revoked, bound_to_clerk_user_id, bound_to_studio_id, redemption_count")
    .ilike("code", cookieCode)
    .maybeSingle();
  if (!codeRow || codeRow.revoked) {
    console.warn("access_code.bind.bad_code", { cookieCode, studioId: args.studioId });
    return;
  }
  if (
    codeRow.bound_to_clerk_user_id &&
    codeRow.bound_to_clerk_user_id !== args.clerkUserId
  ) {
    console.warn("access_code.bind.wrong_owner", {
      code: codeRow.code,
      attemptedBy: args.clerkUserId,
      claimedBy: codeRow.bound_to_clerk_user_id,
    });
    return;
  }

  // Bind code → studio + user (idempotent: noop if already bound)
  await supabase
    .from("access_codes")
    .update({
      bound_to_clerk_user_id: args.clerkUserId,
      bound_to_studio_id: args.studioId,
      redemption_count:
        codeRow.bound_to_studio_id === args.studioId
          ? codeRow.redemption_count
          : codeRow.redemption_count + 1,
      last_redeemed_at: new Date().toISOString(),
    })
    .eq("id", codeRow.id);

  // Seed the trainer_subscription with cohort defaults
  const defaults = cohortDefaults(codeRow.cohort);
  const { data: existingSub } = await supabase
    .from("trainer_subscriptions")
    .select("id")
    .eq("studio_id", args.studioId)
    .maybeSingle();
  if (!existingSub) {
    const { data: insertedSub } = await supabase
      .from("trainer_subscriptions")
      .insert({
        studio_id: args.studioId,
        cohort: codeRow.cohort,
        status: defaults.status,
        cadence: defaults.cadence,
        currency: defaults.currency,
      })
      .select("id")
      .single();
    if (insertedSub) {
      await supabase.from("trainer_subscription_events").insert({
        trainer_subscription_id: insertedSub.id,
        studio_id: args.studioId,
        event_type: "subscription_created",
        to_status: defaults.status,
        to_cohort: codeRow.cohort,
        cadence: defaults.cadence,
        currency: defaults.currency,
        clerk_user_id: args.clerkUserId,
      } as Record<string, unknown>);
    }
  }
  await supabase
    .from("trainers")
    .update({
      cohort: codeRow.cohort,
      subscription_status: defaults.status,
      paid_until: null,
    })
    .eq("id", args.studioId);

  await supabase.from("access_code_events").insert({
    access_code_id: codeRow.id,
    event_type:
      codeRow.bound_to_studio_id === args.studioId
        ? "redeemed_return"
        : "redeemed_first_time",
    clerk_user_id: args.clerkUserId,
  });

  console.info("access_code.bind.success", {
    code: codeRow.code,
    cohort: codeRow.cohort,
    status: defaults.status,
    studioId: args.studioId,
  });
}
