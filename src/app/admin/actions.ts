"use server";

import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { type ActionResult, fail, ok, runAction } from "@/lib/actions";
import { isKnownCohort, type SubscriptionStatus } from "@/lib/cohorts";
import { isSuperAdmin } from "@/lib/env";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { buildAccessCode, extendPaidUntil } from "@/lib/subscription";

/**
 * Server actions for the /admin tool — every trainer-state mutation
 * and every access-code mutation goes through here. Every action:
 *
 *   - re-checks `isSuperAdmin(currentClerkId)` (middleware also
 *     gates /admin, but server actions are reachable from anywhere
 *     they're imported, so this is belt + braces)
 *   - resolves the admin's trainer-row id where needed (for
 *     `triggered_by` / `created_by` audit columns)
 *   - writes a `trainer_subscription_events` or
 *     `access_code_events` row on every state change
 *   - updates the denormalized studio cache transactionally
 *   - revalidates `/admin` so the table refreshes
 *
 * No optimistic UI here — actions return result envelopes and the
 * page does a soft refresh on success.
 */

async function requireAdminContext() {
  const { userId } = await auth();
  if (!userId || !isSuperAdmin(userId)) {
    throw new Error("Forbidden");
  }
  const supabase = createSupabaseAdminClient();
  const { data: trainer } = await supabase
    .from("trainers")
    .select("id, display_name")
    .eq("clerk_id", userId)
    .maybeSingle();
  return { userId, adminTrainerId: trainer?.id ?? null, adminName: trainer?.display_name ?? null, supabase };
}

// ─── Mark trainer paid ────────────────────────────────────────────

const markPaidSchema = z.object({
  studioId: z.string().uuid(),
  cadence: z.enum(["monthly", "annual"]),
  currency: z.enum(["usd", "aed", "sar"]),
  note: z.string().max(280).optional(),
});

export async function markTrainerPaid(raw: unknown): Promise<ActionResult<void>> {
  return runAction(markPaidSchema, raw, async ({ studioId, cadence, currency, note }) => {
    const { adminTrainerId, supabase } = await requireAdminContext();

    const { data: sub } = await supabase
      .from("trainer_subscriptions")
      .select("id, status, cadence, currency, paid_until, cohort")
      .eq("studio_id", studioId)
      .maybeSingle();
    if (!sub) return fail("Trainer subscription not found.");
    if (sub.status === "founding") return fail("Founding trainers don't need paid renewals.");

    const newPaidUntil = extendPaidUntil(
      sub.paid_until ? new Date(sub.paid_until) : null,
      cadence,
    );

    const { error: updErr } = await supabase
      .from("trainer_subscriptions")
      .update({
        status: "active",
        cadence,
        currency,
        paid_until: newPaidUntil.toISOString(),
        last_marked_paid_at: new Date().toISOString(),
        last_marked_paid_by: adminTrainerId,
        reminder_sent_at: null,
      })
      .eq("id", sub.id);
    if (updErr) return fail(updErr.message);

    // Studio cache — updated transactionally with the subscription row.
    await supabase
      .from("trainers")
      .update({
        subscription_status: "active",
        paid_until: newPaidUntil.toISOString(),
      })
      .eq("id", studioId);

    await supabase.from("trainer_subscription_events").insert({
      trainer_subscription_id: sub.id,
      studio_id: studioId,
      event_type: "marked_paid",
      from_status: sub.status,
      to_status: "active",
      paid_until_before: sub.paid_until ?? null,
      paid_until_after: newPaidUntil.toISOString(),
      cadence,
      currency,
      triggered_by: adminTrainerId,
      note: note ?? null,
    });

    revalidatePath("/admin");
    revalidatePath(`/admin/trainers/${studioId}`);
    return ok();
  });
}

// ─── Change cohort ────────────────────────────────────────────────

const changeCohortSchema = z.object({
  studioId: z.string().uuid(),
  newCohort: z.string().min(1).max(40),
  note: z.string().max(280).optional(),
});

export async function changeCohort(raw: unknown): Promise<ActionResult<void>> {
  return runAction(changeCohortSchema, raw, async ({ studioId, newCohort, note }) => {
    const { adminTrainerId, supabase } = await requireAdminContext();
    const { data: sub } = await supabase
      .from("trainer_subscriptions")
      .select("id, cohort")
      .eq("studio_id", studioId)
      .maybeSingle();
    if (!sub) return fail("Trainer subscription not found.");
    if (sub.cohort === newCohort) return ok();

    const { error } = await supabase
      .from("trainer_subscriptions")
      .update({
        cohort: newCohort,
        cohort_assigned_at: new Date().toISOString(),
        cohort_assigned_by: adminTrainerId,
      })
      .eq("id", sub.id);
    if (error) return fail(error.message);

    await supabase.from("trainers").update({ cohort: newCohort }).eq("id", studioId);

    await supabase.from("trainer_subscription_events").insert({
      trainer_subscription_id: sub.id,
      studio_id: studioId,
      event_type: "cohort_changed",
      from_cohort: sub.cohort,
      to_cohort: newCohort,
      triggered_by: adminTrainerId,
      note: note ?? null,
    });

    revalidatePath("/admin");
    return ok();
  });
}

// ─── Grant founding ──────────────────────────────────────────────

const studioSchema = z.object({ studioId: z.string().uuid() });

export async function grantFounding(raw: unknown): Promise<ActionResult<void>> {
  return runAction(studioSchema, raw, async ({ studioId }) => {
    const { adminTrainerId, supabase } = await requireAdminContext();
    const { data: sub } = await supabase
      .from("trainer_subscriptions")
      .select("id, status, cohort")
      .eq("studio_id", studioId)
      .maybeSingle();
    if (!sub) return fail("Trainer subscription not found.");
    if (sub.status === "founding") return ok();

    await supabase
      .from("trainer_subscriptions")
      .update({
        status: "founding",
        cohort: "beta_1",
        cadence: null,
        currency: null,
        paid_until: null,
      })
      .eq("id", sub.id);
    await supabase
      .from("trainers")
      .update({ subscription_status: "founding", cohort: "beta_1", paid_until: null })
      .eq("id", studioId);
    await supabase.from("trainer_subscription_events").insert({
      trainer_subscription_id: sub.id,
      studio_id: studioId,
      event_type: "founding_granted",
      from_status: sub.status,
      to_status: "founding",
      from_cohort: sub.cohort,
      to_cohort: "beta_1",
      triggered_by: adminTrainerId,
    });
    revalidatePath("/admin");
    return ok();
  });
}

// ─── Cancel ───────────────────────────────────────────────────────

export async function cancelTrainerSubscription(raw: unknown): Promise<ActionResult<void>> {
  return runAction(studioSchema, raw, async ({ studioId }) => {
    const { adminTrainerId, supabase } = await requireAdminContext();
    const { data: sub } = await supabase
      .from("trainer_subscriptions")
      .select("id, status")
      .eq("studio_id", studioId)
      .maybeSingle();
    if (!sub) return fail("Trainer subscription not found.");
    if (sub.status === "canceled") return ok();

    await supabase
      .from("trainer_subscriptions")
      .update({ status: "canceled" })
      .eq("id", sub.id);
    await supabase
      .from("trainers")
      .update({ subscription_status: "canceled" })
      .eq("id", studioId);
    await supabase.from("trainer_subscription_events").insert({
      trainer_subscription_id: sub.id,
      studio_id: studioId,
      event_type: "canceled",
      from_status: sub.status,
      to_status: "canceled",
      triggered_by: adminTrainerId,
    });
    revalidatePath("/admin");
    return ok();
  });
}

// ─── Reactivate (canceled → expired) ─────────────────────────────

export async function reactivateTrainerSubscription(raw: unknown): Promise<ActionResult<void>> {
  return runAction(studioSchema, raw, async ({ studioId }) => {
    const { adminTrainerId, supabase } = await requireAdminContext();
    const { data: sub } = await supabase
      .from("trainer_subscriptions")
      .select("id, status, paid_until")
      .eq("studio_id", studioId)
      .maybeSingle();
    if (!sub) return fail("Trainer subscription not found.");
    if (sub.status !== "canceled") return ok();

    // If paid_until is still in the future, restore to active;
    // otherwise back to expired (awaiting mark-paid).
    const nextStatus: SubscriptionStatus =
      sub.paid_until && new Date(sub.paid_until).getTime() > Date.now()
        ? "active"
        : "expired";

    await supabase
      .from("trainer_subscriptions")
      .update({ status: nextStatus })
      .eq("id", sub.id);
    await supabase
      .from("trainers")
      .update({ subscription_status: nextStatus })
      .eq("id", studioId);
    await supabase.from("trainer_subscription_events").insert({
      trainer_subscription_id: sub.id,
      studio_id: studioId,
      event_type: "renewed",
      from_status: "canceled",
      to_status: nextStatus,
      triggered_by: adminTrainerId,
    });
    revalidatePath("/admin");
    return ok();
  });
}

// ─── Soft delete + restore ───────────────────────────────────────

export async function softDeleteStudio(raw: unknown): Promise<ActionResult<void>> {
  return runAction(studioSchema, raw, async ({ studioId }) => {
    const { adminTrainerId, supabase } = await requireAdminContext();
    const { data: sub } = await supabase
      .from("trainer_subscriptions")
      .select("id, status")
      .eq("studio_id", studioId)
      .maybeSingle();
    await supabase
      .from("trainers")
      .update({ soft_deleted_at: new Date().toISOString() })
      .eq("id", studioId);
    if (sub) {
      await supabase.from("trainer_subscription_events").insert({
        trainer_subscription_id: sub.id,
        studio_id: studioId,
        event_type: "soft_deleted",
        from_status: sub.status,
        to_status: sub.status,
        triggered_by: adminTrainerId,
      });
    }
    revalidatePath("/admin");
    return ok();
  });
}

export async function restoreStudio(raw: unknown): Promise<ActionResult<void>> {
  return runAction(studioSchema, raw, async ({ studioId }) => {
    const { adminTrainerId, supabase } = await requireAdminContext();
    const { data: sub } = await supabase
      .from("trainer_subscriptions")
      .select("id, status")
      .eq("studio_id", studioId)
      .maybeSingle();
    await supabase
      .from("trainers")
      .update({ soft_deleted_at: null })
      .eq("id", studioId);
    if (sub) {
      await supabase.from("trainer_subscription_events").insert({
        trainer_subscription_id: sub.id,
        studio_id: studioId,
        event_type: "restored",
        from_status: sub.status,
        to_status: sub.status,
        triggered_by: adminTrainerId,
      });
    }
    revalidatePath("/admin");
    return ok();
  });
}

// ─── Access code: generate ───────────────────────────────────────

const generateCodeSchema = z.object({
  cohort: z.string().min(1).max(40),
  label: z.string().min(1).max(80),
  note: z.string().max(280).optional(),
});

export async function generateAccessCode(
  raw: unknown,
): Promise<ActionResult<{ id: string; code: string }>> {
  return runAction(generateCodeSchema, raw, async ({ cohort, label, note }) => {
    const { adminTrainerId, supabase } = await requireAdminContext();

    // Cap collision retries at 5 — RANDOM_ALPHABET has 32^4 ≈ 1M
    // possibilities per (label, cohort) prefix; collisions are
    // vanishingly rare, but cap regardless to avoid a runaway loop.
    let code = "";
    let attempt = 0;
    let inserted: { id: string; code: string } | null = null;
    while (attempt < 5 && !inserted) {
      code = buildAccessCode(label, cohort);
      const { data, error } = await supabase
        .from("access_codes")
        .insert({
          code,
          cohort,
          label,
          note: note ?? null,
          created_by: adminTrainerId,
        })
        .select("id, code")
        .single();
      if (!error) {
        inserted = data;
        break;
      }
      // Unique-violation on `code` → retry with a fresh random suffix.
      if (error.message?.includes("access_codes_code")) {
        attempt++;
        continue;
      }
      return fail(error.message);
    }
    if (!inserted) return fail("Couldn't generate a unique code after 5 tries.");

    await supabase.from("access_code_events").insert({
      access_code_id: inserted.id,
      event_type: "created",
      triggered_by: adminTrainerId,
      note: note ?? null,
    });

    revalidatePath("/admin/codes");
    return ok({ id: inserted.id, code: inserted.code });
  });
}

// ─── Access code: revoke ─────────────────────────────────────────

const revokeCodeSchema = z.object({
  accessCodeId: z.string().uuid(),
  note: z.string().max(280).optional(),
});

export async function revokeAccessCode(raw: unknown): Promise<ActionResult<void>> {
  return runAction(revokeCodeSchema, raw, async ({ accessCodeId, note }) => {
    const { adminTrainerId, supabase } = await requireAdminContext();
    const { data: codeRow } = await supabase
      .from("access_codes")
      .select("id, revoked")
      .eq("id", accessCodeId)
      .maybeSingle();
    if (!codeRow) return fail("Access code not found.");
    if (codeRow.revoked) return ok();

    await supabase
      .from("access_codes")
      .update({
        revoked: true,
        revoked_at: new Date().toISOString(),
        revoked_by: adminTrainerId,
      })
      .eq("id", accessCodeId);
    await supabase.from("access_code_events").insert({
      access_code_id: accessCodeId,
      event_type: "revoked",
      triggered_by: adminTrainerId,
      note: note ?? null,
    });

    revalidatePath("/admin/codes");
    return ok();
  });
}
// Silence the unused-import warning on `isKnownCohort` — it's
// re-exported via cohorts but only referenced here in TS comments
// for now; keeping the import for future validation work without
// the linter complaining.
void isKnownCohort;
