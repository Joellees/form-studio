"use server";

import { auth, currentUser } from "@clerk/nextjs/server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";

import { type ActionResult, fail, ok, runAction } from "@/lib/actions";
import { BETA_COOKIE } from "@/lib/beta";
import { setOnboardingWarning } from "@/lib/onboarding-warning";
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
    // Without a cookie we can't infer the cohort. Surface a clear
    // recovery path instead of letting the trainer get bounced to
    // /studio/expired with the wrong cohort defaults.
    await setOnboardingWarning(
      supabase,
      args.studioId,
      "We couldn't find your access code in this session. Message the Form Studio team and we'll finish your setup by hand.",
    );
    return;
  }
  /* Wide select includes `trial_days` (migration 0014). The
   * column-missing-tolerant fallback strips it on pre-migration
   * prod — the rest of the flow then runs trial-less. */
  const wide = await supabase
    .from("access_codes")
    .select(
      "id, code, cohort, revoked, bound_to_clerk_user_id, bound_to_studio_id, redemption_count, trial_days",
    )
    .ilike("code", cookieCode)
    .maybeSingle();
  /* Log the result shape so prod can confirm whether trial_days
   * actually flows through this select. If the schema cache is
   * stale we'll see the 42703/PGRST204 branch trigger here and the
   * fallback strip the column — at which point the bind runs
   * trial-less even when the code legitimately has trial_days set
   * in the DB. */
  if (wide.error) {
    console.warn("access_code.bind.wide_select_error", {
      cookieCode,
      code: wide.error.code,
      message: wide.error.message,
    });
  } else if (wide.data) {
    console.info("access_code.bind.wide_select_ok", {
      cookieCode,
      id: (wide.data as { id?: string }).id ?? null,
      trial_days: (wide.data as { trial_days?: number | null }).trial_days ?? null,
    });
  }
  const codeRow =
    wide.error &&
    (wide.error.code === "42703" || wide.error.code === "PGRST204")
      ? (
          await supabase
            .from("access_codes")
            .select(
              "id, code, cohort, revoked, bound_to_clerk_user_id, bound_to_studio_id, redemption_count",
            )
            .ilike("code", cookieCode)
            .maybeSingle()
        ).data
      : wide.data;
  if (!codeRow || codeRow.revoked) {
    console.warn("access_code.bind.bad_code", { cookieCode, studioId: args.studioId });
    await setOnboardingWarning(
      supabase,
      args.studioId,
      codeRow?.revoked
        ? "Your access code is no longer valid. Message the Form Studio team to get a fresh one."
        : "We couldn't match your access code to an active invite. Message the Form Studio team and we'll sort it out.",
    );
    return;
  }
  if (
    codeRow.bound_to_clerk_user_id &&
    codeRow.bound_to_clerk_user_id !== args.clerkUserId
  ) {
    // Same-human override: if the trainer the code is bound to has
    // the same email as the current Clerk user, this is an identity
    // change (e.g. Clerk instance reissued IDs), not theft. Fall
    // through to the rebind block below — it will re-point
    // `bound_to_clerk_user_id` to the current user.
    //
    // We can only run this check when the code has a bound studio_id
    // (i.e. the previous bind reached onboarding). Codes bound at
    // /beta to a Clerk user but never finalized through onboarding
    // have no studio_id; in that case we reject conservatively.
    let sameHuman = false;
    let boundEmail: string | null = null;
    let currentEmail: string | null = null;
    if (codeRow.bound_to_studio_id) {
      const [boundTrainerRes, clerkUser] = await Promise.all([
        supabase
          .from("trainers")
          .select("email")
          .eq("id", codeRow.bound_to_studio_id)
          .maybeSingle(),
        currentUser(),
      ]);
      boundEmail =
        ((boundTrainerRes.data as { email?: string | null } | null)?.email ?? null)?.toLowerCase() ??
        null;
      currentEmail =
        clerkUser?.primaryEmailAddress?.emailAddress?.toLowerCase() ?? null;
      sameHuman = !!boundEmail && !!currentEmail && boundEmail === currentEmail;
    }

    if (!sameHuman) {
      console.warn("access_code.bind.wrong_owner", {
        code: codeRow.code,
        attemptedBy: args.clerkUserId,
        claimedBy: codeRow.bound_to_clerk_user_id,
        boundEmail,
        currentEmail,
      });
      await setOnboardingWarning(
        supabase,
        args.studioId,
        "This access code is registered to a different account. If you recently changed your sign-in email, message the Form Studio team and we'll move it over.",
      );
      return;
    }

    console.info("access_code.bind.rebinding_same_human", {
      code: codeRow.code,
      previousClerkId: codeRow.bound_to_clerk_user_id,
      newClerkId: args.clerkUserId,
      studioId: args.studioId,
      email: currentEmail,
    });
    // Fall through to the rebind block — it overwrites
    // bound_to_clerk_user_id to args.clerkUserId.
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
  /* Trainer-row update — cohort + subscription default. If the
   * redeemed code carried `trial_days`, ALSO stamp
   * `trial_started_at = now()` so the gate's trial branch lets the
   * trainer reach /studio for the trial window. Defensive against
   * the migration not being applied OR transient failures: try the
   * wide update first, fall back to the base update on ANY error
   * (not just column-missing) so the trainer isn't left half-
   * configured if a transient blip hits the wide write. */
  const trialDays = (codeRow as { trial_days?: number | null }).trial_days ?? null;
  const baseTrainerUpdate: Record<string, unknown> = {
    cohort: codeRow.cohort,
    subscription_status: defaults.status,
    paid_until: null,
  };
  /* Verbose logging so prod Vercel logs surface exactly which
   * branch ran and whether the trial got stamped. Diagnosing a
   * silent fail without these breadcrumbs is brutal. */
  console.info("access_code.bind.trial_decision", {
    studioId: args.studioId,
    code: codeRow.code,
    cohort: codeRow.cohort,
    trial_days_on_code: trialDays,
    will_set_trial_started_at: !!(trialDays && trialDays > 0),
  });
  if (trialDays && trialDays > 0) {
    const wideUpdate = await supabase
      .from("trainers")
      .update({ ...baseTrainerUpdate, trial_started_at: new Date().toISOString() })
      .eq("id", args.studioId);
    if (wideUpdate.error) {
      console.warn("access_code.bind.trial_wide_update_failed_falling_back", {
        studioId: args.studioId,
        code: wideUpdate.error.code,
        message: wideUpdate.error.message,
      });
      const fallback = await supabase
        .from("trainers")
        .update(baseTrainerUpdate)
        .eq("id", args.studioId);
      if (fallback.error) {
        console.error("access_code.bind.trial_fallback_update_failed", {
          studioId: args.studioId,
          code: fallback.error.code,
          message: fallback.error.message,
        });
      }
    } else {
      console.info("access_code.bind.trial_started_at_set", {
        studioId: args.studioId,
        code: codeRow.code,
      });
    }
  } else {
    const noTrial = await supabase
      .from("trainers")
      .update(baseTrainerUpdate)
      .eq("id", args.studioId);
    if (noTrial.error) {
      console.error("access_code.bind.no_trial_update_failed", {
        studioId: args.studioId,
        code: noTrial.error.code,
        message: noTrial.error.message,
      });
    }
  }

  await supabase.from("access_code_events").insert({
    access_code_id: codeRow.id,
    event_type:
      codeRow.bound_to_studio_id === args.studioId
        ? "redeemed_return"
        : "redeemed_first_time",
    clerk_user_id: args.clerkUserId,
  });

  // Bind succeeded — clear any leftover warning surface text from
  // an earlier failed attempt on this row.
  await setOnboardingWarning(supabase, args.studioId, null);

  console.info("access_code.bind.success", {
    code: codeRow.code,
    cohort: codeRow.cohort,
    status: defaults.status,
    studioId: args.studioId,
  });
}
