"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { type ActionResult, fail, ok, runAction } from "@/lib/actions";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { requireClient, requireTrainer } from "@/lib/trainer";
import { canClientCancel } from "@/lib/schedule";

const scheduleSchema = z.object({
  clientId: z.string().uuid(),
  scheduledAt: z.string().datetime(),
  durationMinutes: z.number().int().positive(),
  sessionType: z.enum(["in_person", "zoom", "in_app"]),
  templateId: z.string().uuid().nullable(),
  zoomUrl: z.string().url().nullable().or(z.literal("").transform(() => null)),
  name: z.string().nullable(),
});

/**
 * Schedules a session, optionally cloned from a template. If an active
 * paid subscription exists for the client, decrement its sessions_remaining;
 * otherwise still allow scheduling (some trainers track sessions outside of
 * packages) but flag it with no subscription_id.
 */
export async function scheduleSession(raw: unknown): Promise<ActionResult<{ id: string }>> {
  return runAction(scheduleSchema, raw, async (values) => {
    const trainer = await requireTrainer();
    const supabase = createSupabaseAdminClient();

    const { data: activeSub } = await supabase
      .from("subscriptions")
      .select("id, sessions_remaining")
      .eq("client_id", values.clientId)
      .eq("payment_status", "paid")
      .gt("sessions_remaining", 0)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    // Anything the TRAINER schedules — including in-app — counts as
    // trainer-pushed and deducts from the package. Client-initiated
    // in-app requests go through `requestExtraInAppSession` which
    // sets origin='client_requested' and skips the deduction.
    const inAppOrigin = values.sessionType === "in_app" ? "trainer_pushed" : null;

    const { data: session, error: sessErr } = await supabase
      .from("sessions")
      .insert({
        tenant_id: trainer.id,
        client_id: values.clientId,
        subscription_id: activeSub?.id ?? null,
        source_template_id: values.templateId,
        scheduled_at: values.scheduledAt,
        duration_minutes: values.durationMinutes,
        session_type: values.sessionType,
        in_app_origin: inAppOrigin,
        status: "scheduled",
        name: values.name,
        zoom_url: values.zoomUrl,
      })
      .select("id")
      .single();

    if (sessErr) return fail(sessErr.message);

    if (values.templateId) {
      const cloned = await cloneTemplateIntoSession(supabase, trainer.id, values.templateId, session.id);
      if (!cloned.ok) return cloned;
    }

    if (activeSub) {
      await supabase
        .from("subscriptions")
        .update({ sessions_remaining: activeSub.sessions_remaining - 1 })
        .eq("id", activeSub.id);
    }

    revalidatePath("/studio/calendar");
    revalidatePath("/client");
    return ok({ id: session.id });
  });
}

async function cloneTemplateIntoSession(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  tenantId: string,
  templateId: string,
  sessionId: string,
): Promise<ActionResult<void>> {
  const { data: blocks } = await supabase
    .from("template_blocks")
    .select(
      "id, order_index, round_label, round_count, round_rest_seconds, template_block_exercises(id, exercise_id, order_index, setup_override, template_set_groups(*))",
    )
    .eq("template_id", templateId)
    .order("order_index");

  if (!blocks) return ok();

  for (const block of blocks) {
    const { data: newBlock, error: blockErr } = await supabase
      .from("session_blocks")
      .insert({
        session_id: sessionId,
        tenant_id: tenantId,
        order_index: block.order_index,
        round_label: block.round_label,
        round_count: block.round_count,
        round_rest_seconds: block.round_rest_seconds,
      })
      .select("id")
      .single();
    if (blockErr) return fail(blockErr.message);

    for (const be of block.template_block_exercises ?? []) {
      const { data: newBe, error: beErr } = await supabase
        .from("session_block_exercises")
        .insert({
          block_id: newBlock.id,
          exercise_id: be.exercise_id,
          tenant_id: tenantId,
          order_index: be.order_index,
          setup_override: be.setup_override,
        })
        .select("id")
        .single();
      if (beErr) return fail(beErr.message);

      for (const sg of be.template_set_groups ?? []) {
        const { error: sgErr } = await supabase.from("session_set_groups").insert({
          block_exercise_id: newBe.id,
          tenant_id: tenantId,
          order_index: sg.order_index,
          label: sg.label,
          sets: sg.sets,
          rep_type: sg.rep_type,
          rep_value: sg.rep_value,
          weight_type: sg.weight_type,
          weight_value: sg.weight_value,
          rest_seconds: sg.rest_seconds,
          intent_tag: sg.intent_tag,
        });
        if (sgErr) return fail(sgErr.message);
      }
    }
  }
  return ok();
}

const cancelSchema = z.object({
  sessionId: z.string().uuid(),
  reason: z.string().max(500).optional(),
  actor: z.enum(["trainer", "client"]),
});

/**
 * Cancels a session. Trainer-initiated cancels always credit the client.
 * Client-initiated cancels must pass the cutoff check (midnight trainer-tz
 * on the day BEFORE the session); after cutoff the session is forfeit unless
 * the package policy is `credited` and the request wins sympathy from the
 * trainer (out-of-scope for v1).
 */
export async function cancelSession(raw: unknown): Promise<ActionResult<void>> {
  return runAction(cancelSchema, raw, async ({ sessionId, reason, actor }) => {
    const supabase = createSupabaseAdminClient();

    const { data: session } = await supabase
      .from("sessions")
      .select("id, tenant_id, client_id, scheduled_at, status, subscription_id, trainers(timezone)")
      .eq("id", sessionId)
      .maybeSingle();

    if (!session) return fail("Session not found.");
    if (session.status === "cancelled") return ok();

    // @ts-expect-error — nested typings
    const trainerTz: string = session.trainers?.timezone ?? "UTC";
    let creditRestored = true;

    if (actor === "client") {
      // Hard block: no same-day or past-cutoff cancellations from the
      // client side, regardless of the package policy. The trainer
      // can still cancel + apply credits manually via the trainer UI.
      if (!canClientCancel(new Date(session.scheduled_at), trainerTz)) {
        return fail("Too late to cancel from your side — message your trainer.");
      }
      // Within cutoff: the package policy decides whether the
      // session is restored to remaining (reschedule) or counted.
      const { data: sub } = await supabase
        .from("subscriptions")
        .select("packages!subscriptions_package_id_fkey(cancellation_policy)")
        .eq("id", session.subscription_id ?? "")
        .maybeSingle();
      // @ts-expect-error — nested typings
      const policy: string = sub?.packages?.cancellation_policy ?? "credited";
      creditRestored = policy === "credited";
    }

    const { error } = await supabase
      .from("sessions")
      .update({ status: "cancelled" })
      .eq("id", sessionId);
    if (error) return fail(error.message);

    if (creditRestored && session.subscription_id) {
      const { data: sub } = await supabase
        .from("subscriptions")
        .select("sessions_remaining")
        .eq("id", session.subscription_id)
        .maybeSingle();
      if (sub) {
        await supabase
          .from("subscriptions")
          .update({ sessions_remaining: sub.sessions_remaining + 1 })
          .eq("id", session.subscription_id);
      }
    }

    await supabase.from("cancellations").insert({
      tenant_id: session.tenant_id,
      session_id: sessionId,
      cancelled_by: actor,
      reason: reason ?? null,
      credit_restored: creditRestored,
    });

    revalidatePath("/studio/calendar");
    revalidatePath("/client");
    return ok();
  });
}

const requestSchema = z.object({
  scheduledAt: z.string().datetime(),
  durationMinutes: z.number().int().positive().default(60),
  // In-app sessions are NOT booked through this path — they go through
  // `requestExtraInAppSession` ($3, no deduction) on the client portal,
  // or are scheduled directly by the trainer with origin='trainer_pushed'.
  sessionType: z.enum(["in_person", "zoom"]).default("in_person"),
  notes: z.string().max(500).optional(),
});

/**
 * Client-initiated request to book FROM the active package. Creates a
 * session in `requested` state; the deduction happens in
 * `approveSessionRequest` once the trainer approves.
 *
 * Resolves identity via `requireClient()` — same path every other
 * client-side action uses. The prior version queried `clients` with
 * NO user filter and `.maybeSingle()`, which returned null in any
 * tenant with 2+ clients (because Supabase JS `.maybeSingle()`
 * errors silently when the result set is > 1). That's why a fresh
 * signup on Joelle's tenant (13 clients) saw a red "No client
 * profile." even though the linkage was correct.
 */
export async function requestSession(raw: unknown): Promise<ActionResult<{ id: string }>> {
  return runAction(requestSchema, raw, async (values) => {
    let client: Awaited<ReturnType<typeof requireClient>>;
    try {
      client = await requireClient();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg === "Not authenticated") {
        return fail("Sign in to request a session.");
      }
      if (msg === "PICK_STUDIO") {
        return fail("Pick a studio before requesting a session.");
      }
      // No client membership exists for this Clerk user. Surfaces the
      // specific "your profile is loading or missing" copy on the
      // form rather than the old generic "No client profile."
      return fail(
        "We couldn't find your client profile. Try signing out and back in, then refresh. If this keeps happening, contact your trainer.",
      );
    }

    // Per Beta 2 spec: payment status does NOT gate session requests.
    // Any signed-in client with a valid client row can submit a
    // 'requested' session — the trainer approves or declines. Money
    // is settled between trainer and client externally; Form Studio's
    // role here is bookkeeping, not enforcement.
    const supabase = createSupabaseAdminClient();
    const { data, error } = await supabase
      .from("sessions")
      .insert({
        tenant_id: client.tenantId,
        client_id: client.id,
        scheduled_at: values.scheduledAt,
        duration_minutes: values.durationMinutes,
        session_type: values.sessionType,
        status: "requested",
        notes: values.notes ?? null,
      })
      .select("id")
      .single();
    if (error) return fail(error.message);
    revalidatePath("/client/dashboard");
    revalidatePath("/client");
    revalidatePath("/studio/dashboard");
    revalidatePath("/studio/calendar");
    return ok({ id: data.id });
  });
}

export async function approveSessionRequest(sessionId: string): Promise<ActionResult<void>> {
  return runAction(z.object({ id: z.string().uuid() }), { id: sessionId }, async ({ id }) => {
    const trainer = await requireTrainer();
    const supabase = createSupabaseAdminClient();
    const { data: session } = await supabase
      .from("sessions")
      .select("id, client_id, subscription_id, session_type, in_app_origin")
      .eq("id", id)
      .eq("tenant_id", trainer.id)
      .maybeSingle();
    if (!session) return fail("Session not found.");

    // Client-requested in-app sessions are paid out-of-pocket ($3) and
    // do NOT deduct from the package. Everything else (in-person,
    // zoom, trainer-pushed in-app) deducts on approval.
    const isClientRequestedInApp =
      session.session_type === "in_app" && session.in_app_origin === "client_requested";

    const { data: activeSub } = isClientRequestedInApp
      ? { data: null as null | { id: string; sessions_remaining: number } }
      : await supabase
          .from("subscriptions")
          .select("id, sessions_remaining")
          .eq("client_id", session.client_id)
          .eq("payment_status", "paid")
          .gt("sessions_remaining", 0)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

    const { error } = await supabase
      .from("sessions")
      .update({
        status: "scheduled",
        subscription_id: isClientRequestedInApp ? null : activeSub?.id ?? null,
      })
      .eq("id", id);
    if (error) return fail(error.message);

    if (activeSub) {
      await supabase
        .from("subscriptions")
        .update({ sessions_remaining: activeSub.sessions_remaining - 1 })
        .eq("id", activeSub.id);
    }
    revalidatePath("/studio/calendar");
    revalidatePath("/client");
    return ok();
  });
}

/**
 * Trainer-side decline for a client session request. Sets
 * `status='declined'` (already a valid value in the type union) and
 * optionally stores a short trainer note on `sessions.notes` so the
 * client can see why when they look at the session in their portal.
 *
 * Distinct from `cancelSession`:
 *   - cancel is for sessions that were SCHEDULED and the trainer/
 *     client is undoing that — credits handling, audit, etc.
 *   - decline is for sessions that NEVER scheduled in the first
 *     place — no credit accounting needed, since approve is what
 *     would have decremented the count.
 *
 * Authorization: session must belong to this trainer AND still be in
 * `requested` state (we don't let a "decline" rewrite an already-
 * scheduled or completed session — that's what cancel is for).
 */
const declineRequestSchema = z.object({
  sessionId: z.string().uuid(),
  note: z.string().max(400).optional(),
});

export async function declineSessionRequest(
  raw: unknown,
): Promise<ActionResult<void>> {
  return runAction(declineRequestSchema, raw, async ({ sessionId, note }) => {
    const trainer = await requireTrainer();
    const supabase = createSupabaseAdminClient();

    const { data: session } = await supabase
      .from("sessions")
      .select("id, status")
      .eq("id", sessionId)
      .eq("tenant_id", trainer.id)
      .maybeSingle();
    if (!session) return fail("Session not found.");
    if (session.status !== "requested") {
      return fail("Only pending requests can be declined.");
    }

    const update: Record<string, unknown> = { status: "declined" };
    if (note && note.trim().length > 0) update.notes = note.trim();

    const { error } = await supabase
      .from("sessions")
      .update(update)
      .eq("id", sessionId)
      .eq("tenant_id", trainer.id);
    if (error) return fail(error.message);

    revalidatePath("/studio/calendar");
    revalidatePath("/studio/dashboard");
    revalidatePath("/client");
    revalidatePath(`/studio/sessions/${sessionId}`);
    return ok();
  });
}

const updateTypeSchema = z.object({
  sessionId: z.string().uuid(),
  sessionType: z.enum(["in_person", "zoom", "in_app"]),
});

/**
 * Inline edit of a session's type. Scope is the trainer's own tenant.
 */
export async function updateSessionType(raw: unknown): Promise<ActionResult<void>> {
  return runAction(updateTypeSchema, raw, async ({ sessionId, sessionType }) => {
    const trainer = await requireTrainer();
    const supabase = createSupabaseAdminClient();
    const { error } = await supabase
      .from("sessions")
      .update({ session_type: sessionType })
      .eq("id", sessionId)
      .eq("tenant_id", trainer.id);
    if (error) return fail(error.message);
    revalidatePath("/studio/calendar");
    revalidatePath("/client");
    revalidatePath(`/studio/sessions/${sessionId}`);
    return ok();
  });
}
