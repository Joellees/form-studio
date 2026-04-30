"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { type ActionResult, fail, ok, runAction } from "@/lib/actions";
import { EXTRA_INAPP_PRICE_USD } from "@/lib/pricing";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { requireClient } from "@/lib/trainer";

/**
 * Server actions that live on the client portal. They authorize via
 * `requireClient()`, which resolves the signed-in Clerk user back to a
 * row in `clients` — no separate client_id is ever trusted from the
 * caller.
 */

const noteSchema = z.object({
  note: z.string().max(2000).nullable().or(z.literal("").transform(() => null)),
});

/**
 * The free-form note from client to trainer, shown on both sides. We
 * trim and null-out empties so the trainer doesn't see an empty quote.
 */
export async function updateNoteToTrainer(raw: unknown): Promise<ActionResult<void>> {
  return runAction(noteSchema, raw, async ({ note }) => {
    const client = await requireClient();
    const admin = createSupabaseAdminClient();
    const value = note?.trim() ? note.trim() : null;
    const { error } = await admin
      .from("clients")
      .update({ note_to_trainer: value })
      .eq("id", client.id);
    if (error) {
      // Friendlier copy if the migration hasn't shipped yet.
      if (error.message?.toLowerCase().includes("column") && error.message?.toLowerCase().includes("note_to_trainer")) {
        return fail("This studio hasn&rsquo;t enabled notes yet.");
      }
      return fail(error.message);
    }
    revalidatePath("/client");
    revalidatePath(`/studio/clients/${client.id}`);
    return ok();
  });
}

const extraInAppSchema = z.object({
  scheduledAt: z.string().datetime(),
  notes: z.string().max(500).optional().or(z.literal("").transform(() => undefined)),
});

/**
 * Client requests an additional in-app workout — separate from any
 * scheduled in-person/zoom session. This does NOT deduct from their
 * package; instead a $3 charge is recorded against the trainer's
 * payment method.
 *
 * Flow:
 *   1. Client taps "request extra workout · $3" on the portal,
 *      confirms in a small modal
 *   2. We create a session row with status='requested',
 *      session_type='in_app', in_app_origin='client_requested',
 *      in_app_surcharge_paid=false (Stripe/Tap will flip this to
 *      true once the charge clears; for now it's manual)
 *   3. We insert a payments row with amount_usd=3, method='manual',
 *      status='pending'
 *   4. Trainer sees it in their action feed as an "in-app upgrade"
 *      item, approves it, attaches a workout — the session then
 *      flips to status='scheduled' without touching sessions_remaining
 */
export async function requestExtraInAppSession(raw: unknown): Promise<ActionResult<{ id: string }>> {
  return runAction(extraInAppSchema, raw, async ({ scheduledAt, notes }) => {
    const client = await requireClient();
    const admin = createSupabaseAdminClient();

    // Create the session with the right origin tag so the
    // approve-side knows not to deduct.
    const { data: inserted, error: sessErr } = await admin
      .from("sessions")
      .insert({
        tenant_id: client.tenantId,
        client_id: client.id,
        scheduled_at: scheduledAt,
        duration_minutes: 60,
        session_type: "in_app",
        in_app_origin: "client_requested",
        in_app_surcharge_paid: false,
        status: "requested",
        notes: notes ?? null,
      })
      .select("id")
      .single();
    if (sessErr) return fail(sessErr.message);

    // Record the $3 charge as pending. Real payment processing
    // (Stripe/Tap) will flip status='paid' + the session's
    // in_app_surcharge_paid=true. Until then it's a manual record.
    await admin.from("payments").insert({
      tenant_id: client.tenantId,
      subscription_id: null,
      session_id: inserted.id,
      amount_usd: EXTRA_INAPP_PRICE_USD,
      method: "manual",
      status: "pending",
    });

    revalidatePath("/client");
    revalidatePath("/studio/calendar");
    revalidatePath("/studio/dashboard");
    return ok({ id: inserted.id });
  });
}

const cycleSchema = z.object({
  phase: z.enum(["menstrual", "follicular", "ovulation", "luteal"]),
  notes: z.string().max(500).nullable().or(z.literal("").transform(() => null)),
});

/**
 * Cycle log — the only log type the client can write from the portal
 * in v1. Other log types are tracked by the trainer or auto-generated
 * (PRs, weight). Gated on the client_profile_fields.cycle toggle.
 */
export async function logCycle(raw: unknown): Promise<ActionResult<void>> {
  return runAction(cycleSchema, raw, async ({ phase, notes }) => {
    const client = await requireClient();
    const admin = createSupabaseAdminClient();

    const { data: fields } = await admin
      .from("client_profile_fields")
      .select("cycle")
      .eq("client_id", client.id)
      .maybeSingle();
    if (!fields?.cycle) return fail("Cycle logging isn't enabled.");

    const { error } = await admin.from("client_logs").insert({
      client_id: client.id,
      tenant_id: client.tenantId,
      field_type: "cycle",
      value: { phase },
      notes,
    });
    if (error) return fail(error.message);
    revalidatePath("/client");
    return ok();
  });
}
