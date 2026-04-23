"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { type ActionResult, fail, ok, runAction } from "@/lib/actions";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireTrainer } from "@/lib/trainer";

const packageSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(1, "Required").max(80),
  session_count: z.number().int().positive("Must be greater than 0"),
  duration_days: z.number().int().positive("Must be greater than 0"),
  price_usd: z.number().nonnegative("Price must be 0 or greater"),
  session_type_mix: z.enum(["strength", "strength_mobility"]),
  payment_mode: z.enum(["manual", "online"]),
  cancellation_policy: z.enum(["credited", "lost"]),
});

export async function savePackage(raw: unknown): Promise<ActionResult<{ id: string }>> {
  return runAction(packageSchema, raw, async (values) => {
    const trainer = await requireTrainer();
    const supabase = await createSupabaseServerClient();
    const payload = {
      tenant_id: trainer.id,
      name: values.name,
      session_count: values.session_count,
      duration_days: values.duration_days,
      price_usd: values.price_usd,
      session_type_mix: values.session_type_mix,
      payment_mode: values.payment_mode,
      cancellation_policy: values.cancellation_policy,
    };

    if (values.id) {
      const { data, error } = await supabase
        .from("packages")
        .update(payload)
        .eq("id", values.id)
        .select("id")
        .single();
      if (error) return fail(error.message);
      revalidatePath("/studio/packages");
      return ok({ id: data.id });
    }

    const { data, error } = await supabase.from("packages").insert(payload).select("id").single();
    if (error) return fail(error.message);
    revalidatePath("/studio/packages");
    return ok({ id: data.id });
  });
}

export async function archivePackage(id: string): Promise<ActionResult<void>> {
  return runAction(z.object({ id: z.string().uuid() }), { id }, async ({ id }) => {
    const trainer = await requireTrainer();
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase
      .from("packages")
      .update({ active: false })
      .eq("id", id)
      .eq("tenant_id", trainer.id);
    if (error) return fail(error.message);
    revalidatePath("/studio/packages");
    return ok();
  });
}
