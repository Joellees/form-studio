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
