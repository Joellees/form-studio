"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { type ActionResult, fail, ok, runAction } from "@/lib/actions";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const schema = z.object({
  field_type: z.enum(["weight", "cycle", "measurements", "progress_photo", "mood", "sleep", "pr", "custom"]),
  value: z.record(z.unknown()),
  notes: z.string().max(500).nullable(),
});

export async function createLog(raw: unknown): Promise<ActionResult<{ id: string }>> {
  return runAction(schema, raw, async (values) => {
    const supabase = await createSupabaseServerClient();

    const { data: client } = await supabase.from("clients").select("id, tenant_id").maybeSingle();
    if (!client) return fail("No client profile.");

    const { data, error } = await supabase
      .from("client_logs")
      .insert({
        client_id: client.id,
        tenant_id: client.tenant_id,
        field_type: values.field_type,
        value: values.value,
        notes: values.notes,
      })
      .select("id")
      .single();
    if (error) return fail(error.message);
    revalidatePath("/client/logs");
    return ok({ id: data.id });
  });
}
