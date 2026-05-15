"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { type ActionResult, fail, ok, runAction } from "@/lib/actions";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { requireTrainer } from "@/lib/trainer";

const createSchema = z.object({
  name: z.string().min(1, "Required").max(80),
  day_label: z.string().max(40).optional().or(z.literal("")),
  description: z.string().max(2000).optional().or(z.literal("")),
});

export async function createTemplate(raw: unknown): Promise<ActionResult<{ id: string }>> {
  return runAction(createSchema, raw, async (values) => {
    const trainer = await requireTrainer();
    const supabase = createSupabaseAdminClient();
    const { data, error } = await supabase
      .from("session_templates")
      .insert({
        tenant_id: trainer.id,
        name: values.name,
        day_label: values.day_label || null,
        description: values.description || null,
      })
      .select("id")
      .single();
    if (error) return fail(error.message);
    revalidatePath("/studio/templates");
    return ok({ id: data.id });
  });
}

const createWithExercisesSchema = z.object({
  name: z.string().min(1, "Required").max(80),
  day_label: z.string().max(40).nullable().optional(),
  description: z.string().max(2000).nullable().optional(),
  exerciseIds: z.array(z.string().uuid()).min(1).max(60),
});

/**
 * Create a new workout template with a batch of exercises pre-attached
 * — one block per exercise, each seeded with a default `Working` set
 * group (3 × 10 reps · 0kg · 90s rest). The trainer lands on the
 * template editor and tunes the sets from there.
 *
 * This is the destination of the "add to workout" flow on the
 * library: trainer selects N exercises, names a workout, and gets
 * dropped straight into the editor for it.
 */
export async function createTemplateWithExercises(
  raw: unknown,
): Promise<ActionResult<{ id: string }>> {
  return runAction(createWithExercisesSchema, raw, async (values) => {
    const trainer = await requireTrainer();
    const supabase = createSupabaseAdminClient();

    // Verify every exercise belongs to this trainer before doing any
    // writes — guards against IDs from another tenant getting passed in.
    const { data: owned } = await supabase
      .from("exercises")
      .select("id")
      .eq("tenant_id", trainer.id)
      .in("id", values.exerciseIds);
    const ownedSet = new Set((owned ?? []).map((e) => e.id as string));
    if (ownedSet.size !== values.exerciseIds.length) {
      return fail("Some of those exercises don&rsquo;t belong to your studio.");
    }

    const { data: tpl, error: tplErr } = await supabase
      .from("session_templates")
      .insert({
        tenant_id: trainer.id,
        name: values.name,
        day_label: values.day_label || null,
        description: values.description || null,
      })
      .select("id")
      .single();
    if (tplErr) return fail(tplErr.message);
    const templateId = tpl.id as string;

    // Preserve the trainer's selection order — exercise N becomes
    // block N. Each block has one set group with sensible defaults.
    for (let i = 0; i < values.exerciseIds.length; i++) {
      const exerciseId = values.exerciseIds[i]!;
      const { data: block, error: blockErr } = await supabase
        .from("template_blocks")
        .insert({
          template_id: templateId,
          tenant_id: trainer.id,
          order_index: i,
          round_count: 1,
        })
        .select("id")
        .single();
      if (blockErr) return fail(blockErr.message);

      const { data: be, error: beErr } = await supabase
        .from("template_block_exercises")
        .insert({
          block_id: block.id,
          exercise_id: exerciseId,
          tenant_id: trainer.id,
          order_index: 0,
        })
        .select("id")
        .single();
      if (beErr) return fail(beErr.message);

      const { error: sgErr } = await supabase.from("template_set_groups").insert({
        block_exercise_id: be.id,
        tenant_id: trainer.id,
        order_index: 0,
        label: "Working",
        sets: 3,
        rep_type: "fixed",
        rep_value: { type: "fixed", reps: 10 },
        weight_type: "load",
        weight_value: { type: "load", kg: 0 },
        rest_seconds: 90,
      });
      if (sgErr) return fail(sgErr.message);
    }

    revalidatePath("/studio/templates");
    revalidatePath("/studio/library");
    return ok({ id: templateId });
  });
}

const appendExercisesSchema = z.object({
  templateId: z.string().uuid(),
  exerciseIds: z.array(z.string().uuid()).min(1).max(60),
});

/**
 * Append a batch of exercises onto an existing template — each becomes
 * a new block at the end (preserving order), seeded with a default
 * `Working` set group. Trainer-side bulk flow: select N exercises in
 * the library, pick an existing workout, exercises get tacked on and
 * the trainer lands in the editor.
 */
export async function appendExercisesToTemplate(
  raw: unknown,
): Promise<ActionResult<{ id: string; appended: number }>> {
  return runAction(appendExercisesSchema, raw, async ({ templateId, exerciseIds }) => {
    const trainer = await requireTrainer();
    const supabase = createSupabaseAdminClient();

    // Verify the template belongs to this trainer.
    const { data: tpl } = await supabase
      .from("session_templates")
      .select("id")
      .eq("id", templateId)
      .eq("tenant_id", trainer.id)
      .maybeSingle();
    if (!tpl) return fail("That workout isn&rsquo;t yours.");

    // Verify every exercise also belongs to this trainer.
    const { data: owned } = await supabase
      .from("exercises")
      .select("id")
      .eq("tenant_id", trainer.id)
      .in("id", exerciseIds);
    if ((owned ?? []).length !== exerciseIds.length) {
      return fail("Some of those exercises don&rsquo;t belong to your studio.");
    }

    const { data: existingBlocks } = await supabase
      .from("template_blocks")
      .select("order_index")
      .eq("template_id", templateId)
      .order("order_index", { ascending: false })
      .limit(1);
    let nextOrder = (existingBlocks?.[0]?.order_index ?? -1) + 1;

    for (const exerciseId of exerciseIds) {
      const { data: block, error: blockErr } = await supabase
        .from("template_blocks")
        .insert({
          template_id: templateId,
          tenant_id: trainer.id,
          order_index: nextOrder++,
          round_count: 1,
        })
        .select("id")
        .single();
      if (blockErr) return fail(blockErr.message);

      const { data: be, error: beErr } = await supabase
        .from("template_block_exercises")
        .insert({
          block_id: block.id,
          exercise_id: exerciseId,
          tenant_id: trainer.id,
          order_index: 0,
        })
        .select("id")
        .single();
      if (beErr) return fail(beErr.message);

      const { error: sgErr } = await supabase.from("template_set_groups").insert({
        block_exercise_id: be.id,
        tenant_id: trainer.id,
        order_index: 0,
        label: "Working",
        sets: 3,
        rep_type: "fixed",
        rep_value: { type: "fixed", reps: 10 },
        weight_type: "load",
        weight_value: { type: "load", kg: 0 },
        rest_seconds: 90,
      });
      if (sgErr) return fail(sgErr.message);
    }

    revalidatePath(`/studio/templates/${templateId}`);
    revalidatePath("/studio/library");
    return ok({ id: templateId, appended: exerciseIds.length });
  });
}

export async function archiveTemplate(id: string): Promise<ActionResult<void>> {
  return runAction(z.object({ id: z.string().uuid() }), { id }, async ({ id }) => {
    const trainer = await requireTrainer();
    const supabase = createSupabaseAdminClient();
    const { error } = await supabase
      .from("session_templates")
      .update({ archived: true })
      .eq("id", id)
      .eq("tenant_id", trainer.id);
    if (error) return fail(error.message);
    revalidatePath("/studio/templates");
    return ok();
  });
}

const addExerciseSchema = z.object({
  templateId: z.string().uuid(),
  exerciseId: z.string().uuid(),
});

/**
 * Appends an exercise to the end of a template. Creates a new block (one
 * exercise per block for v1; rounds / supersets land in a follow-up) with
 * a single default set group so the trainer has something editable.
 */
export async function addExerciseToTemplate(raw: unknown): Promise<ActionResult<{ blockId: string }>> {
  return runAction(addExerciseSchema, raw, async ({ templateId, exerciseId }) => {
    const trainer = await requireTrainer();
    const supabase = createSupabaseAdminClient();

    const { data: existingBlocks } = await supabase
      .from("template_blocks")
      .select("order_index")
      .eq("template_id", templateId)
      .order("order_index", { ascending: false })
      .limit(1);
    const nextOrder = (existingBlocks?.[0]?.order_index ?? -1) + 1;

    const { data: block, error: blockErr } = await supabase
      .from("template_blocks")
      .insert({
        template_id: templateId,
        tenant_id: trainer.id,
        order_index: nextOrder,
        round_count: 1,
      })
      .select("id")
      .single();
    if (blockErr) return fail(blockErr.message);

    const { data: blockEx, error: beErr } = await supabase
      .from("template_block_exercises")
      .insert({
        block_id: block.id,
        exercise_id: exerciseId,
        tenant_id: trainer.id,
        order_index: 0,
      })
      .select("id")
      .single();
    if (beErr) return fail(beErr.message);

    const { error: sgErr } = await supabase.from("template_set_groups").insert({
      block_exercise_id: blockEx.id,
      tenant_id: trainer.id,
      order_index: 0,
      label: "Working",
      sets: 3,
      rep_type: "fixed",
      rep_value: { type: "fixed", reps: 10 },
      weight_type: "load",
      weight_value: { type: "load", kg: 0 },
      rest_seconds: 90,
    });
    if (sgErr) return fail(sgErr.message);

    revalidatePath(`/studio/templates/${templateId}`);
    return ok({ blockId: block.id });
  });
}

export async function removeTemplateBlock(blockId: string): Promise<ActionResult<void>> {
  return runAction(z.object({ id: z.string().uuid() }), { id: blockId }, async ({ id }) => {
    const trainer = await requireTrainer();
    const supabase = createSupabaseAdminClient();
    const { error } = await supabase.from("template_blocks").delete().eq("id", id).eq("tenant_id", trainer.id);
    if (error) return fail(error.message);
    return ok();
  });
}

const setGroupUpdateSchema = z.object({
  id: z.string().uuid(),
  sets: z.number().int().positive().optional(),
  rep_type: z.string().optional(),
  rep_value: z.unknown().optional(),
  weight_type: z.string().optional(),
  weight_value: z.unknown().optional(),
  rest_seconds: z.number().int().nullable().optional(),
  label: z.string().nullable().optional(),
});

export async function updateSetGroup(raw: unknown): Promise<ActionResult<void>> {
  return runAction(setGroupUpdateSchema, raw, async ({ id, ...fields }) => {
    const trainer = await requireTrainer();
    const supabase = createSupabaseAdminClient();
    const { error } = await supabase
      .from("template_set_groups")
      .update(fields)
      .eq("id", id)
      .eq("tenant_id", trainer.id);
    if (error) return fail(error.message);
    return ok();
  });
}

const reorderBlocksSchema = z.object({
  templateId: z.string().uuid(),
  blockIds: z.array(z.string().uuid()).max(200),
});

/**
 * Atomically reorders the blocks in a template by writing the
 * `order_index` of each block to match its position in `blockIds`.
 * Used by the drag-and-drop UI in `template-builder.tsx` and by the
 * bulk Save Workout action below for the combined save path.
 *
 * Verifies every passed block belongs to the trainer's template
 * before any UPDATE so a malicious caller can't reorder someone
 * else's rows. Sequential UPDATEs because the supabase client has
 * no single primitive for "set order_index per id" in one round
 * trip; typical workouts have ≤ 20 blocks so latency is well under
 * a second.
 */
export async function reorderTemplateBlocks(
  raw: unknown,
): Promise<ActionResult<void>> {
  return runAction(reorderBlocksSchema, raw, async ({ templateId, blockIds }) => {
    const trainer = await requireTrainer();
    const supabase = createSupabaseAdminClient();

    const { data: tpl } = await supabase
      .from("session_templates")
      .select("id")
      .eq("id", templateId)
      .eq("tenant_id", trainer.id)
      .maybeSingle();
    if (!tpl) return fail("That workout isn't yours.");

    if (blockIds.length === 0) return ok();

    const { data: owned } = await supabase
      .from("template_blocks")
      .select("id")
      .eq("template_id", templateId)
      .eq("tenant_id", trainer.id)
      .in("id", blockIds);
    if ((owned ?? []).length !== blockIds.length) {
      return fail("Some blocks don't belong to this workout.");
    }

    for (let i = 0; i < blockIds.length; i++) {
      const { error } = await supabase
        .from("template_blocks")
        .update({ order_index: i })
        .eq("id", blockIds[i]!)
        .eq("tenant_id", trainer.id);
      if (error) return fail(error.message);
    }

    revalidatePath(`/studio/templates/${templateId}`);
    return ok();
  });
}

const saveTemplateChangesSchema = z.object({
  templateId: z.string().uuid(),
  setGroups: z
    .array(
      z.object({
        id: z.string().uuid(),
        sets: z.number().int().positive().optional(),
        rep_type: z.string().optional(),
        rep_value: z.unknown().optional(),
        weight_type: z.string().optional(),
        weight_value: z.unknown().optional(),
        rest_seconds: z.number().int().nullable().optional(),
        label: z.string().nullable().optional(),
      }),
    )
    .max(500),
  blockOrder: z.array(z.string().uuid()).max(200).optional(),
});

/**
 * Bulk-save endpoint for the explicit "Save workout" button in the
 * template builder. Combines what was previously per-field
 * autosave-on-blur into a single user-initiated commit.
 *
 * Receives the full set of edited `set_groups` plus an optional new
 * `blockOrder` and persists both in a single trainer-bound action.
 * Authorization is enforced by joining each id back to the trainer's
 * tenant before writing — same defense as `updateSetGroup` and
 * `reorderTemplateBlocks`.
 */
export async function saveTemplateChanges(
  raw: unknown,
): Promise<ActionResult<void>> {
  return runAction(saveTemplateChangesSchema, raw, async ({ templateId, setGroups, blockOrder }) => {
    const trainer = await requireTrainer();
    const supabase = createSupabaseAdminClient();

    const { data: tpl } = await supabase
      .from("session_templates")
      .select("id")
      .eq("id", templateId)
      .eq("tenant_id", trainer.id)
      .maybeSingle();
    if (!tpl) return fail("That workout isn't yours.");

    for (const sg of setGroups) {
      const { id, ...fields } = sg;
      const { error } = await supabase
        .from("template_set_groups")
        .update(fields)
        .eq("id", id)
        .eq("tenant_id", trainer.id);
      if (error) return fail(error.message);
    }

    if (blockOrder && blockOrder.length > 0) {
      const { data: owned } = await supabase
        .from("template_blocks")
        .select("id")
        .eq("template_id", templateId)
        .eq("tenant_id", trainer.id)
        .in("id", blockOrder);
      if ((owned ?? []).length !== blockOrder.length) {
        return fail("Some blocks don't belong to this workout.");
      }
      for (let i = 0; i < blockOrder.length; i++) {
        const { error } = await supabase
          .from("template_blocks")
          .update({ order_index: i })
          .eq("id", blockOrder[i]!)
          .eq("tenant_id", trainer.id);
        if (error) return fail(error.message);
      }
    }

    revalidatePath(`/studio/templates/${templateId}`);
    return ok();
  });
}

const addSetGroupSchema = z.object({
  templateId: z.string().uuid(),
  blockExerciseId: z.string().uuid(),
});

/**
 * Appends a new set group to an existing exercise (block_exercise) in
 * a template. Used by the "+ add set" button under each exercise card
 * in `template-builder.tsx`. Defaults match what `addExerciseToTemplate`
 * seeds for the first set group, so a freshly-added set is editable
 * straight away with sensible numbers (3 sets × 10 reps × 0 kg × 90s).
 *
 * Authorization: walks back to the template via `block_exercise →
 * block → template` and checks tenant_id at every step.
 */
export async function addSetGroupToBlockExercise(
  raw: unknown,
): Promise<ActionResult<{ id: string }>> {
  return runAction(addSetGroupSchema, raw, async ({ templateId, blockExerciseId }) => {
    const trainer = await requireTrainer();
    const supabase = createSupabaseAdminClient();

    /* Verify the block_exercise belongs to this trainer AND lives
     * under the named template — both guards in one query. */
    const { data: be } = await supabase
      .from("template_block_exercises")
      .select(
        "id, tenant_id, template_blocks!inner(template_id)",
      )
      .eq("id", blockExerciseId)
      .eq("tenant_id", trainer.id)
      .maybeSingle();
    if (!be) return fail("That exercise isn't yours.");
    const block = (be as { template_blocks?: { template_id?: string } | { template_id?: string }[] })
      .template_blocks;
    const beTemplateId = Array.isArray(block) ? block[0]?.template_id : block?.template_id;
    if (beTemplateId !== templateId) return fail("Exercise doesn't belong to that workout.");

    /* Next order_index after the last existing set group on this
     * exercise. Default sets / reps / weight / rest match the
     * first-set defaults used by `addExerciseToTemplate`. */
    const { data: last } = await supabase
      .from("template_set_groups")
      .select("order_index")
      .eq("block_exercise_id", blockExerciseId)
      .order("order_index", { ascending: false })
      .limit(1);
    const nextOrder = (last?.[0]?.order_index ?? -1) + 1;

    const { data, error } = await supabase
      .from("template_set_groups")
      .insert({
        block_exercise_id: blockExerciseId,
        tenant_id: trainer.id,
        order_index: nextOrder,
        label: nextOrder === 0 ? "Working" : null,
        sets: 3,
        rep_type: "fixed",
        rep_value: { type: "fixed", reps: 10 },
        weight_type: "load",
        weight_value: { type: "load", kg: 0 },
        rest_seconds: 90,
      })
      .select("id")
      .single();
    if (error) return fail(error.message);

    revalidatePath(`/studio/templates/${templateId}`);
    return ok({ id: data.id });
  });
}

const removeSetGroupSchema = z.object({
  templateId: z.string().uuid(),
  setGroupId: z.string().uuid(),
});

/**
 * Removes a single set group from an exercise. Refuses to delete the
 * last remaining set group — every exercise in a template has to
 * carry at least one (the renderer assumes it). Trainer should
 * remove the exercise itself if they want a clean slate.
 */
/**
 * Server action used by the "Apply to session" modal on the
 * template detail page. Lists the trainer's active clients and,
 * per client, the next handful of upcoming or recent sessions so
 * the trainer can pick a target. Limited to non-archived,
 * non-cancelled sessions within ±21 days of today by default —
 * enough range to cover "today's session" or "tomorrow's
 * rescheduled one" without spamming the picker with months of
 * history.
 *
 * Returns a flat list; the client component groups by client. Doing
 * the join here keeps the modal a single round-trip.
 */
export async function listSessionsForApply(): Promise<
  ActionResult<{
    clients: Array<{
      id: string;
      display_name: string;
      sessions: Array<{
        id: string;
        scheduled_at: string;
        name: string | null;
        duration_minutes: number;
        status: string;
      }>;
    }>;
  }>
> {
  return runAction(z.object({}), {}, async () => {
    const trainer = await requireTrainer();
    const supabase = createSupabaseAdminClient();

    const now = new Date();
    const minDate = new Date(now.getTime() - 21 * 24 * 60 * 60 * 1000).toISOString();
    const maxDate = new Date(now.getTime() + 21 * 24 * 60 * 60 * 1000).toISOString();

    /* One round trip — sessions joined with their client. We sort
     * upcoming first (after now, ascending) and let the client side
     * split if it wants past-vs-future grouping. */
    const { data, error } = await supabase
      .from("sessions")
      .select("id, scheduled_at, duration_minutes, name, status, client_id, clients(id, display_name)")
      .eq("tenant_id", trainer.id)
      .gte("scheduled_at", minDate)
      .lte("scheduled_at", maxDate)
      .neq("status", "cancelled")
      .order("scheduled_at", { ascending: true });
    if (error) return fail(error.message);

    /* Group sessions by client_id so the modal can render a clean
     * "Client → list of sessions" tree. Clients with no session in
     * range are omitted — they have nothing for the trainer to
     * apply to. */
    const byClient = new Map<
      string,
      {
        id: string;
        display_name: string;
        sessions: Array<{
          id: string;
          scheduled_at: string;
          name: string | null;
          duration_minutes: number;
          status: string;
        }>;
      }
    >();
    for (const s of data ?? []) {
      const c = (s as { clients?: { id: string; display_name: string } | { id: string; display_name: string }[] | null }).clients;
      const client = Array.isArray(c) ? c[0] : c;
      if (!client) continue;
      const key = client.id;
      if (!byClient.has(key)) {
        byClient.set(key, { id: client.id, display_name: client.display_name, sessions: [] });
      }
      byClient.get(key)!.sessions.push({
        id: s.id as string,
        scheduled_at: s.scheduled_at as string,
        name: (s.name as string | null) ?? null,
        duration_minutes: s.duration_minutes as number,
        status: s.status as string,
      });
    }

    /* Sort each client's sessions by upcoming-first (scheduled_at >=
     * now first, then past) — the most likely target is the next
     * one. */
    const nowIso = now.toISOString();
    for (const group of byClient.values()) {
      group.sessions.sort((a, b) => {
        const aFuture = a.scheduled_at >= nowIso;
        const bFuture = b.scheduled_at >= nowIso;
        if (aFuture !== bFuture) return aFuture ? -1 : 1;
        if (aFuture) return a.scheduled_at.localeCompare(b.scheduled_at);
        return b.scheduled_at.localeCompare(a.scheduled_at);
      });
    }

    return ok({
      clients: Array.from(byClient.values()).sort((a, b) =>
        a.display_name.localeCompare(b.display_name),
      ),
    });
  });
}

export async function removeSetGroup(raw: unknown): Promise<ActionResult<void>> {
  return runAction(removeSetGroupSchema, raw, async ({ templateId, setGroupId }) => {
    const trainer = await requireTrainer();
    const supabase = createSupabaseAdminClient();

    const { data: sg } = await supabase
      .from("template_set_groups")
      .select("id, block_exercise_id")
      .eq("id", setGroupId)
      .eq("tenant_id", trainer.id)
      .maybeSingle();
    if (!sg) return fail("That set group isn't yours.");

    const blockExerciseId = (sg as { block_exercise_id: string }).block_exercise_id;
    const { data: siblings } = await supabase
      .from("template_set_groups")
      .select("id")
      .eq("block_exercise_id", blockExerciseId);
    if ((siblings ?? []).length <= 1) {
      return fail("Each exercise needs at least one set group. Remove the exercise instead.");
    }

    const { error } = await supabase
      .from("template_set_groups")
      .delete()
      .eq("id", setGroupId)
      .eq("tenant_id", trainer.id);
    if (error) return fail(error.message);

    revalidatePath(`/studio/templates/${templateId}`);
    return ok();
  });
}
