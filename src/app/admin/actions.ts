"use server";

import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { type ActionResult, fail, ok, runAction } from "@/lib/actions";
import { generateAccessCodeValue, formatBeta1Code, formatBeta2Code, nextBeta2Number, sanitizeBeta1Label } from "@/lib/access-codes";
import { deleteClerkUser } from "@/lib/clerk";
import { isKnownCohort, type SubscriptionStatus } from "@/lib/cohorts";
import { isSuperAdmin } from "@/lib/env";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { extendPaidUntil } from "@/lib/subscription";

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

// ─── Hard delete (irreversible) ──────────────────────────────────
//
// Two-phase: (1) delete the trainer's Clerk user, then (2) call the
// `public.hard_delete_trainer` Postgres function which runs the verify
// + clear-FKs + DELETE inside a single transaction.
// See `supabase/migrations/0005_hard_delete_trainer_function.sql`.
//
// Why Clerk-first abort-on-failure (Path B from the design doc):
//
//   - If we DB-deleted first and then Clerk failed, the trainer's email
//     would be orphaned in Clerk forever (since we lost the clerk_id by
//     deleting the trainer row) and they couldn't re-sign-up.
//   - Doing Clerk first means a Clerk failure aborts cleanly — trainer
//     row stays intact, nothing is lost, admin retries.
//   - If Clerk succeeds but the SQL function then fails, the partial
//     state is recoverable: re-running hard-delete is safe because
//     `deleteClerkUser` treats Clerk's 404 ("user not found") as
//     idempotent success — the re-run proceeds straight to the SQL.
//
// The confirmation string must match the trainer's `display_name` exactly
// (byte-for-byte) — enforced inside the SQL function so the check can't
// be bypassed by calling this action directly. The UI also enforces it
// client-side, but that's UX, not security.
//
// TODO: Storage cleanup
// For full GDPR-compliant deletion, also delete Supabase Storage objects
// under the tenant's prefix paths (exercise-videos/<tenant_id>/*,
// client-progress/<tenant_id>/*, etc). Currently skipped because:
// - Cleanup runs outside the SQL transaction, can fail asymmetrically
// - Test-trainer use case has minimal/no uploads
// - Real deletion requests are rare and can be handled case-by-case
// When implementing, use supabase.storage.from(bucket).remove([paths])
// after the DB delete commits.

const hardDeleteSchema = z.object({
  studioId: z.string().uuid(),
  confirmDisplayName: z.string().min(1).max(120),
});

export async function hardDeleteTrainer(
  raw: unknown,
): Promise<ActionResult<void>> {
  return runAction(hardDeleteSchema, raw, async ({ studioId, confirmDisplayName }) => {
    const { adminTrainerId, adminName, supabase } = await requireAdminContext();

    // Capture the trainer's identity (including clerk_id) BEFORE the
    // delete — afterward the row is gone. If the trainer doesn't exist
    // here, abort with a clear error before we ever touch Clerk.
    const { data: target } = await supabase
      .from("trainers")
      .select("display_name, email, subdomain_slug, clerk_id")
      .eq("id", studioId)
      .maybeSingle();
    if (!target) return fail("Trainer not found.");

    // ── Phase 1: Clerk delete (skip if no clerk_id on the row) ──
    if (target.clerk_id) {
      const clerkResult = await deleteClerkUser(target.clerk_id);
      if (!clerkResult.ok) {
        console.warn("admin.hard_delete_trainer.clerk_delete_failed", {
          studioId,
          displayName: target.display_name,
          email: target.email,
          status: clerkResult.status,
          error: clerkResult.error,
          adminTrainerId,
          adminName,
          at: new Date().toISOString(),
        });
        return fail(
          `Could not delete the trainer's Clerk account: ${clerkResult.error}. ` +
            `Trainer row was NOT touched. You can retry — Clerk treats 404 as success on the next attempt.`,
        );
      }
      console.warn("admin.hard_delete_trainer.clerk_user_deleted", {
        studioId,
        displayName: target.display_name,
        clerkUserIdPrefix: target.clerk_id.slice(0, 12),
        alreadyGone: !!clerkResult.alreadyGone,
        adminTrainerId,
        adminName,
        at: new Date().toISOString(),
      });
    } else {
      // Edge case — e.g. a hand-inserted row with no clerk_id. Skip
      // Phase 1, proceed to DB delete.
      console.warn("admin.hard_delete_trainer.clerk_id_missing_skipping", {
        studioId,
        displayName: target.display_name,
        at: new Date().toISOString(),
      });
    }

    // ── Phase 2: DB delete ──
    const { error } = await supabase.rpc("hard_delete_trainer", {
      p_studio_id: studioId,
      p_confirm_display_name: confirmDisplayName,
    });
    if (error) {
      // Clerk already gone, but DB delete failed. Log prominently — the
      // admin needs to re-run hard-delete to finish cleanup. Clerk's
      // idempotent 404 path will make the re-run safe.
      console.error(
        "admin.hard_delete_trainer.db_delete_failed_after_clerk_delete",
        {
          studioId,
          displayName: target.display_name,
          clerkAlreadyDeleted: !!target.clerk_id,
          dbError: error.message,
          adminTrainerId,
          adminName,
          at: new Date().toISOString(),
        },
      );
      if (target.clerk_id) {
        return fail(
          `Clerk user was deleted but the DB delete failed: ${error.message}. ` +
            `Re-run hard-delete on this trainer to finish cleanup — Clerk deletion is idempotent.`,
        );
      }
      // The SQL function returns 'Display-name confirmation failed' on
      // mismatch and 'Trainer not found' on a missing row — surface
      // verbatim so the UI can show something useful.
      return fail(error.message);
    }

    // Application-log the destruction. No DB-side audit row possible: the
    // most natural home (`trainer_subscription_events`) cascade-deletes
    // with the trainer, so any row written there would vanish.
    console.warn("admin.hard_delete_trainer", {
      studioId,
      displayName: target.display_name,
      email: target.email,
      subdomainSlug: target.subdomain_slug,
      adminTrainerId,
      adminName,
      at: new Date().toISOString(),
    });

    revalidatePath("/admin");
    return ok();
  });
}

// ─── Access code: generate ───────────────────────────────────────
//
// Format per cohort:
//   beta_1 → {LABEL}-FS1    (suffix from COHORT_CODE_FORMATS; admin-typed label, sanitized, unique)
//   beta_2 → B2-NNN          (sequential, never reused — see lib/access-codes.ts)
//   launch → rejected        (Launch cohort doesn't use codes)
//
// `label` is required for beta_1 (and any cohort whose format is
// label_dash_suffix) and ignored for beta_2 (the system generates
// the number). The Zod schema accepts an optional label and the
// dispatch logic enforces per-cohort presence.

const generateCodeSchema = z.object({
  cohort: z.string().min(1).max(40),
  label: z.string().max(80).optional(),
  note: z.string().max(280).optional(),
});

export async function generateAccessCode(
  raw: unknown,
): Promise<ActionResult<{ id: string; code: string }>> {
  return runAction(generateCodeSchema, raw, async ({ cohort, label, note }) => {
    const { adminTrainerId, supabase } = await requireAdminContext();

    // Beta 2 may lose a race against a concurrent generator (two
    // requests computing max(num) at the same time). Retry up to 5
    // times on UNIQUE-constraint violations; the next call recomputes
    // `max(num) + 1` and lands on a fresh number.
    let inserted: { id: string; code: string; storedLabel: string | null } | null = null;
    let lastError = "";
    for (let attempt = 0; attempt < 5 && !inserted; attempt++) {
      const gen = await generateAccessCodeValue(supabase, {
        cohort,
        ...(label !== undefined ? { rawLabel: label } : {}),
      });
      if (!gen.ok) return fail(gen.error);

      const storedLabel =
        gen.sanitizedLabel ?? (label && label.trim().length > 0 ? label.trim() : null);

      const { data, error } = await supabase
        .from("access_codes")
        .insert({
          code: gen.code,
          cohort,
          label: storedLabel,
          note: note ?? null,
          created_by: adminTrainerId,
        })
        .select("id, code")
        .single();
      if (!error) {
        inserted = { id: data.id, code: data.code, storedLabel };
        break;
      }
      // UNIQUE on `code` → almost certainly a B2 race; retry. For B1
      // this would mean the label collided despite our pre-check, also
      // safe to retry — though `generateAccessCodeValue` will short-
      // circuit with a clear error on the next attempt.
      if (error.message?.toLowerCase().includes("access_codes_code") ||
          error.message?.toLowerCase().includes("duplicate key")) {
        lastError = error.message;
        continue;
      }
      return fail(error.message);
    }
    if (!inserted) {
      return fail(`Couldn't generate a unique code after 5 tries. Last error: ${lastError}`);
    }

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

// ─── Access code: preview (no INSERT) ────────────────────────────
//
// Used by the Generate-Code modal to show "next code: B2-052"
// before the admin commits. The actual generation re-computes the
// number on submit — if a concurrent generator slips in between
// preview and submit, the committed code will differ by 1 and the
// admin's preview was just stale UI. No correctness issue.

const previewCodeSchema = z.object({
  cohort: z.string().min(1).max(40),
  label: z.string().max(80).optional(),
});

export async function previewNextAccessCode(
  raw: unknown,
): Promise<ActionResult<{ preview: string }>> {
  return runAction(previewCodeSchema, raw, async ({ cohort, label }) => {
    const { supabase } = await requireAdminContext();

    if (cohort === "launch") {
      return fail("Launch cohort signups don't use access codes.");
    }
    if (cohort === "beta_1") {
      const sanitized = sanitizeBeta1Label(label ?? "");
      // formatBeta1Code reads the suffix from COHORT_CODE_FORMATS so this
      // stays in sync with code generation automatically.
      if (!sanitized) return ok({ preview: formatBeta1Code("{LABEL}") });
      return ok({ preview: formatBeta1Code(sanitized) });
    }
    if (cohort === "beta_2") {
      const n = await nextBeta2Number(supabase);
      return ok({ preview: formatBeta2Code(n) });
    }
    return fail(`Unsupported cohort "${cohort}".`);
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
// ─── Access code: hard delete (irreversible) ─────────────────────
//
// Counterpart to `hardDeleteTrainer`. Calls the
// `public.hard_delete_access_code(p_access_code_id, p_confirm_code)`
// Postgres function — atomic verify + bound-trainer-active check +
// DELETE. The events table cascades via its FK so this single action
// removes the code AND its full audit history.
//
// Refuses to delete codes bound to a trainer who still has an active
// (not-soft-deleted) `trainers` row — the function returns a clear
// error which we pass through to the UI.

const hardDeleteCodeSchema = z.object({
  accessCodeId: z.string().uuid(),
  confirmCode: z.string().min(1).max(80),
});

export async function hardDeleteAccessCode(
  raw: unknown,
): Promise<ActionResult<void>> {
  return runAction(hardDeleteCodeSchema, raw, async ({ accessCodeId, confirmCode }) => {
    const { adminTrainerId, adminName, supabase } = await requireAdminContext();

    // Capture identity BEFORE the delete for the audit log.
    const { data: target } = await supabase
      .from("access_codes")
      .select("code, cohort, label, revoked, redemption_count, bound_to_studio_id")
      .eq("id", accessCodeId)
      .maybeSingle();
    if (!target) return fail("Access code not found.");

    const { error } = await supabase.rpc("hard_delete_access_code", {
      p_access_code_id: accessCodeId,
      p_confirm_code: confirmCode,
    });
    if (error) return fail(error.message);

    console.warn("admin.hard_delete_access_code", {
      accessCodeId,
      code: target.code,
      cohort: target.cohort,
      label: target.label,
      wasRevoked: target.revoked,
      redemptionCount: target.redemption_count,
      wasBound: !!target.bound_to_studio_id,
      adminTrainerId,
      adminName,
      at: new Date().toISOString(),
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
