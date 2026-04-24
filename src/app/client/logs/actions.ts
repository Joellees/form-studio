"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { type ActionResult, fail, ok, runAction } from "@/lib/actions";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { requireClient } from "@/lib/trainer";

const schema = z.object({
  field_type: z.enum(["weight", "cycle", "measurements", "progress_photo", "mood", "sleep", "pr", "custom"]),
  value: z.record(z.unknown()),
  notes: z.string().max(500).nullable(),
});

export async function createLog(raw: unknown): Promise<ActionResult<{ id: string }>> {
  return runAction(schema, raw, async (values) => {
    const client = await requireClient();
    const admin = createSupabaseAdminClient();

    const { data, error } = await admin
      .from("client_logs")
      .insert({
        client_id: client.id,
        tenant_id: client.tenantId,
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
