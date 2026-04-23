"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { type ActionResult, fail, ok, runAction } from "@/lib/actions";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { requireTrainer } from "@/lib/trainer";

/**
 * Logs what actually happened on a single set group. Used by both the
 * trainer on /studio/sessions/[id] and the client on /client/sessions/[id].
 */
const performSchema = z.object({
  id: z.string().uuid(),
  performed_sets: z.number().int().nonnegative().optional(),
  performed_notes: z.string().nullable().optional(),
  performed_reps: z.unknown().optional(),
  performed_weight: z.unknown().optional(),
});

export async function logPerformedSet(raw: unknown): Promise<ActionResult<void>> {
  return runAction(performSchema, raw, async ({ id, ...fields }) => {
    const admin = createSupabaseAdminClient();
    const { error } = await admin.from("session_set_groups").update(fields).eq("id", id);
    if (error) return fail(error.message);
    return ok();
  });
}

/**
 * Appends an exercise from the library to a session. Creates a new
 * session_block (one exercise per block for v1) with a default set
 * group so the trainer has something to tune right away.
 */
const addExerciseSchema = z.object({
  sessionId: z.string().uuid(),
  exerciseId: z.string().uuid(),
});

export async function addExerciseToSession(raw: unknown): Promise<ActionResult<{ blockId: string }>> {
  return runAction(addExerciseSchema, raw, async ({ sessionId, exerciseId }) => {
    const trainer = await requireTrainer();
    const admin = createSupabaseAdminClient();

    // Authorize: session must belong to this trainer
    const { data: session } = await admin
      .from("sessions")
      .select("id, tenant_id")
      .eq("id", sessionId)
      .eq("tenant_id", trainer.id)
      .maybeSingle();
    if (!session) return fail("Session not found.");

    const { data: last } = await admin
      .from("session_blocks")
      .select("order_index")
      .eq("session_id", sessionId)
      .order("order_index", { ascending: false })
      .limit(1);
    const nextOrder = (last?.[0]?.order_index ?? -1) + 1;

    const { data: block, error: blockErr } = await admin
      .from("session_blocks")
      .insert({ session_id: sessionId, tenant_id: trainer.id, order_index: nextOrder, round_count: 1 })
      .select("id")
      .single();
    if (blockErr) return fail(blockErr.message);

    // Pull exercise defaults to seed a friendlier starting set group.
    const { data: ex } = await admin
      .from("exercises")
      .select("default_rest_seconds, is_unilateral")
      .eq("id", exerciseId)
      .maybeSingle();

    const { data: be, error: beErr } = await admin
      .from("session_block_exercises")
      .insert({ block_id: block.id, exercise_id: exerciseId, tenant_id: trainer.id, order_index: 0 })
      .select("id")
      .single();
    if (beErr) return fail(beErr.message);

    const { error: sgErr } = await admin.from("session_set_groups").insert({
      block_exercise_id: be.id,
      tenant_id: trainer.id,
      order_index: 0,
      label: "Working",
      sets: 3,
      rep_type: ex?.is_unilateral ? "unilateral" : "fixed",
      rep_value: ex?.is_unilateral ? { type: "unilateral", per_side: 8 } : { type: "fixed", reps: 10 },
      weight_type: "load",
      weight_value: { type: "load", kg: 0 },
      rest_seconds: ex?.default_rest_seconds ?? 90,
    });
    if (sgErr) return fail(sgErr.message);

    revalidatePath(`/studio/sessions/${sessionId}`);
    revalidatePath(`/client/sessions/${sessionId}`);
    return ok({ blockId: block.id });
  });
}

export async function removeSessionBlock(blockId: string): Promise<ActionResult<void>> {
  return runAction(z.string().uuid(), blockId, async (id) => {
    const trainer = await requireTrainer();
    const admin = createSupabaseAdminClient();
    const { error } = await admin
      .from("session_blocks")
      .delete()
      .eq("id", id)
      .eq("tenant_id", trainer.id);
    if (error) return fail(error.message);
    return ok();
  });
}

/**
 * Updates a prescribed set group (sets / reps / weight / rest), as the
 * trainer tunes the session inline. Different from logPerformedSet which
 * records what happened.
 */
const setGroupSchema = z.object({
  id: z.string().uuid(),
  sets: z.number().int().positive().optional(),
  rep_type: z.string().optional(),
  rep_value: z.unknown().optional(),
  weight_type: z.string().optional(),
  weight_value: z.unknown().optional(),
  rest_seconds: z.number().int().nullable().optional(),
  label: z.string().nullable().optional(),
});

export async function updateSessionSetGroup(raw: unknown): Promise<ActionResult<void>> {
  return runAction(setGroupSchema, raw, async ({ id, ...fields }) => {
    const trainer = await requireTrainer();
    const admin = createSupabaseAdminClient();
    const { error } = await admin
      .from("session_set_groups")
      .update(fields)
      .eq("id", id)
      .eq("tenant_id", trainer.id);
    if (error) return fail(error.message);
    return ok();
  });
}

/**
 * Saves trainer-facing session notes. Stored on sessions.notes and
 * visible to the client too.
 */
const notesSchema = z.object({
  sessionId: z.string().uuid(),
  notes: z.string().max(4000),
});

export async function updateSessionNotes(raw: unknown): Promise<ActionResult<void>> {
  return runAction(notesSchema, raw, async ({ sessionId, notes }) => {
    const trainer = await requireTrainer();
    const admin = createSupabaseAdminClient();
    const { error } = await admin
      .from("sessions")
      .update({ notes: notes || null })
      .eq("id", sessionId)
      .eq("tenant_id", trainer.id);
    if (error) return fail(error.message);
    revalidatePath(`/studio/sessions/${sessionId}`);
    revalidatePath(`/client/sessions/${sessionId}`);
    return ok();
  });
}
