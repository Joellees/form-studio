"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { type ActionResult, fail, ok, runAction } from "@/lib/actions";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { requireTrainer } from "@/lib/trainer";

// ─── Groups ──────────────────────────────────────────────────────────────

const groupCreateSchema = z.object({ name: z.string().min(1).max(40) });

export async function saveGroup(raw: unknown): Promise<ActionResult<{ id: string }>> {
  return runAction(groupCreateSchema, raw, async ({ name }) => {
    const trainer = await requireTrainer();
    const admin = createSupabaseAdminClient();
    const { data, error } = await admin
      .from("exercise_groups")
      .insert({ tenant_id: trainer.id, name })
      .select("id")
      .single();
    if (error) return fail(error.message);
    revalidatePath("/studio/library");
    return ok({ id: data.id });
  });
}

const groupRenameSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(40),
});

export async function renameGroup(raw: unknown): Promise<ActionResult<void>> {
  return runAction(groupRenameSchema, raw, async ({ id, name }) => {
    const trainer = await requireTrainer();
    const admin = createSupabaseAdminClient();
    const { error } = await admin
      .from("exercise_groups")
      .update({ name })
      .eq("id", id)
      .eq("tenant_id", trainer.id);
    if (error) return fail(error.message);
    revalidatePath("/studio/library");
    return ok();
  });
}

export async function deleteGroup(id: string): Promise<ActionResult<void>> {
  return runAction(z.string().uuid(), id, async (id) => {
    const trainer = await requireTrainer();
    const admin = createSupabaseAdminClient();
    // Exercises referencing this group have group_id set null by FK.
    const { error } = await admin
      .from("exercise_groups")
      .delete()
      .eq("id", id)
      .eq("tenant_id", trainer.id);
    if (error) return fail(error.message);
    revalidatePath("/studio/library");
    return ok();
  });
}

// ─── Exercises ───────────────────────────────────────────────────────────

const exerciseSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(1, "Required").max(120),
  group_id: z.string().uuid().nullable(),
  equipment: z.string().max(40).nullable(),
  is_timed: z.boolean(),
  default_rep_type: z.enum(["fixed", "range", "unilateral", "amrap", "time"]).nullable(),
  default_rep_value: z.record(z.unknown()).nullable(),
  default_rest_seconds: z.number().int().nonnegative().nullable(),
  notes: z.string().max(2000).nullable(),
  video_url: z.string().url().nullable().or(z.literal("").transform(() => null)),
});

export async function saveExercise(raw: unknown): Promise<ActionResult<{ id: string }>> {
  return runAction(exerciseSchema, raw, async (values) => {
    const trainer = await requireTrainer();
    const admin = createSupabaseAdminClient();

    const payload = {
      tenant_id: trainer.id,
      name: values.name,
      group_id: values.group_id,
      equipment: values.equipment,
      is_timed: values.is_timed,
      default_rep_type: values.default_rep_type,
      default_rep_value: values.default_rep_value,
      default_rest_seconds: values.default_rest_seconds,
      trainer_notes: values.notes,
      video_url: values.video_url,
      // Keep is_unilateral in sync with rep type for legacy callers
      is_unilateral: values.default_rep_type === "unilateral",
    };

    if (values.id) {
      const { data, error } = await admin
        .from("exercises")
        .update(payload)
        .eq("id", values.id)
        .eq("tenant_id", trainer.id)
        .select("id")
        .single();
      if (error) return fail(error.message);
      revalidatePath("/studio/library");
      return ok({ id: data.id });
    }

    const { data, error } = await admin.from("exercises").insert(payload).select("id").single();
    if (error) return fail(error.message);
    revalidatePath("/studio/library");
    return ok({ id: data.id });
  });
}

export async function archiveExercise(id: string): Promise<ActionResult<void>> {
  return runAction(z.string().uuid(), id, async (id) => {
    const trainer = await requireTrainer();
    const admin = createSupabaseAdminClient();
    const { error } = await admin
      .from("exercises")
      .update({ archived: true })
      .eq("id", id)
      .eq("tenant_id", trainer.id);
    if (error) return fail(error.message);
    revalidatePath("/studio/library");
    return ok();
  });
}
