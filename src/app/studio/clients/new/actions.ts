"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { type ActionResult, fail, ok, runAction } from "@/lib/actions";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireTrainer } from "@/lib/trainer";

const schema = z.object({
  displayName: z.string().min(1, "Required").max(80),
  email: z.string().email("Invalid email").optional().or(z.literal("")),
  phone: z.string().max(40).optional().or(z.literal("")),
  notes: z.string().max(2000).optional().or(z.literal("")),
});

export async function createClient(raw: unknown): Promise<ActionResult<{ id: string }>> {
  return runAction(schema, raw, async (values) => {
    const trainer = await requireTrainer();
    const supabase = await createSupabaseServerClient();

    const insert = {
      tenant_id: trainer.id,
      display_name: values.displayName,
      email: values.email || null,
      phone: values.phone || null,
      notes: values.notes || null,
    };

    const { data, error } = await supabase
      .from("clients")
      .insert(insert)
      .select("id")
      .single();

    if (error) return fail(error.message);

    // Default field toggles — trainer can adjust on the client profile page.
    await supabase.from("client_profile_fields").insert({
      client_id: data.id,
      tenant_id: trainer.id,
      weight: true,
    });

    revalidatePath("/studio/clients");
    return ok({ id: data.id });
  });
}
