"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { type ActionResult, fail, ok, runAction } from "@/lib/actions";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireTrainer } from "@/lib/trainer";

const exerciseSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(1, "Required").max(120),
  default_descriptor: z.string().nullable(),
  group_tag: z.string().max(40).nullable(),
  equipment: z.string().max(40).nullable(),
  is_unilateral: z.boolean(),
  default_rest_seconds: z.number().int().nonnegative().nullable(),
  trainer_notes: z.string().max(2000).nullable(),
  video_url: z.string().url().nullable().or(z.literal("").transform(() => null)),
});

export async function saveExercise(raw: unknown): Promise<ActionResult<{ id: string }>> {
  return runAction(exerciseSchema, raw, async (values) => {
    const trainer = await requireTrainer();
    const supabase = await createSupabaseServerClient();

    const payload = {
      tenant_id: trainer.id,
      name: values.name,
      default_descriptor: values.default_descriptor,
      group_tag: values.group_tag,
      equipment: values.equipment,
      is_unilateral: values.is_unilateral,
      default_rest_seconds: values.default_rest_seconds,
      trainer_notes: values.trainer_notes,
      video_url: values.video_url,
    };

    if (values.id) {
      const { data, error } = await supabase.from("exercises").update(payload).eq("id", values.id).select("id").single();
      if (error) return fail(error.message);
      revalidatePath("/studio/library");
      return ok({ id: data.id });
    }

    const { data, error } = await supabase.from("exercises").insert(payload).select("id").single();
    if (error) return fail(error.message);
    revalidatePath("/studio/library");
    return ok({ id: data.id });
  });
}

export async function archiveExercise(id: string): Promise<ActionResult<void>> {
  return runAction(z.object({ id: z.string().uuid() }), { id }, async ({ id }) => {
    const trainer = await requireTrainer();
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase
      .from("exercises")
      .update({ archived: true })
      .eq("id", id)
      .eq("tenant_id", trainer.id);
    if (error) return fail(error.message);
    revalidatePath("/studio/library");
    return ok();
  });
}
