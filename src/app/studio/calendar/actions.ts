"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { type ActionResult, fail, ok, runAction } from "@/lib/actions";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireTrainer } from "@/lib/trainer";
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
    const supabase = await createSupabaseServerClient();

    const { data: activeSub } = await supabase
      .from("subscriptions")
      .select("id, sessions_remaining")
      .eq("client_id", values.clientId)
      .eq("payment_status", "paid")
      .gt("sessions_remaining", 0)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

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
    revalidatePath("/client/calendar");
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
    const supabase = await createSupabaseServerClient();

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
      if (!canClientCancel(new Date(session.scheduled_at), trainerTz)) {
        // Past cutoff — respect the package cancellation policy.
        const { data: sub } = await supabase
          .from("subscriptions")
          .select("packages(cancellation_policy)")
          .eq("id", session.subscription_id ?? "")
          .maybeSingle();
        // @ts-expect-error — nested typings
        const policy: string = sub?.packages?.cancellation_policy ?? "lost";
        creditRestored = policy === "credited";
      }
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
    revalidatePath("/client/calendar");
    return ok();
  });
}

const requestSchema = z.object({
  scheduledAt: z.string().datetime(),
  durationMinutes: z.number().int().positive().default(60),
  sessionType: z.enum(["in_person", "zoom", "in_app"]).default("in_person"),
  notes: z.string().max(500).optional(),
});

/**
 * Client-initiated request. Creates a session in `requested` state,
 * consuming a session credit only once the trainer approves.
 */
export async function requestSession(raw: unknown): Promise<ActionResult<{ id: string }>> {
  return runAction(requestSchema, raw, async (values) => {
    const supabase = await createSupabaseServerClient();
    const { data: client } = await supabase
      .from("clients")
      .select("id, tenant_id, subscriptions(id, sessions_remaining, payment_status)")
      .maybeSingle();
    if (!client) return fail("No client profile.");

    const subs = (client.subscriptions ?? []) as Array<{ id: string; sessions_remaining: number; payment_status: string }>;
    const hasAvailable = subs.some((s) => s.payment_status === "paid" && s.sessions_remaining > 0);
    if (!hasAvailable) return fail("No remaining sessions. Reserve another block to continue.");

    const { data, error } = await supabase
      .from("sessions")
      .insert({
        tenant_id: client.tenant_id,
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
    revalidatePath("/client/calendar");
    return ok({ id: data.id });
  });
}

export async function approveSessionRequest(sessionId: string): Promise<ActionResult<void>> {
  return runAction(z.object({ id: z.string().uuid() }), { id: sessionId }, async ({ id }) => {
    const trainer = await requireTrainer();
    const supabase = await createSupabaseServerClient();
    const { data: session } = await supabase
      .from("sessions")
      .select("id, client_id, subscription_id")
      .eq("id", id)
      .eq("tenant_id", trainer.id)
      .maybeSingle();
    if (!session) return fail("Session not found.");

    const { data: activeSub } = await supabase
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
      .update({ status: "scheduled", subscription_id: activeSub?.id ?? null })
      .eq("id", id);
    if (error) return fail(error.message);

    if (activeSub) {
      await supabase
        .from("subscriptions")
        .update({ sessions_remaining: activeSub.sessions_remaining - 1 })
        .eq("id", activeSub.id);
    }
    revalidatePath("/studio/calendar");
    revalidatePath("/client/calendar");
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
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase
      .from("sessions")
      .update({ session_type: sessionType })
      .eq("id", sessionId)
      .eq("tenant_id", trainer.id);
    if (error) return fail(error.message);
    revalidatePath("/studio/calendar");
    revalidatePath("/client/calendar");
    revalidatePath(`/studio/sessions/${sessionId}`);
    return ok();
  });
}
