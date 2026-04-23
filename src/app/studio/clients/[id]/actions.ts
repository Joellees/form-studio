"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { type ActionResult, fail, ok, runAction } from "@/lib/actions";
import { createSupabaseAdminClient, createSupabaseServerClient } from "@/lib/supabase/server";
import { requireTrainer } from "@/lib/trainer";

const archiveSchema = z.object({
  clientId: z.string().uuid(),
  archived: z.boolean(),
});

/**
 * Soft-removes a client. We don&rsquo;t delete — session history, logs, and
 * subscriptions are preserved. active=false hides them from the main
 * list and stops them counting toward trainer billing.
 */
export async function setClientArchived(raw: unknown): Promise<ActionResult<void>> {
  return runAction(archiveSchema, raw, async ({ clientId, archived }) => {
    const trainer = await requireTrainer();
    const admin = createSupabaseAdminClient();
    const { error } = await admin
      .from("clients")
      .update({ active: !archived })
      .eq("id", clientId)
      .eq("tenant_id", trainer.id);
    if (error) return fail(error.message);
    revalidatePath("/studio/clients");
    revalidatePath(`/studio/clients/${clientId}`);
    return ok();
  });
}

const fieldsSchema = z.object({
  clientId: z.string().uuid(),
  fields: z.object({
    weight: z.boolean(),
    cycle: z.boolean(),
    measurements: z.boolean(),
    progress_photos: z.boolean(),
    mood: z.boolean(),
    sleep: z.boolean(),
    prs: z.boolean(),
  }),
});

export async function updateClientFields(raw: unknown): Promise<ActionResult<void>> {
  return runAction(fieldsSchema, raw, async ({ clientId, fields }) => {
    const trainer = await requireTrainer();
    const supabase = await createSupabaseServerClient();

    const { error } = await supabase
      .from("client_profile_fields")
      .upsert(
        {
          client_id: clientId,
          tenant_id: trainer.id,
          ...fields,
        },
        { onConflict: "client_id" },
      );

    if (error) return fail(error.message);
    revalidatePath(`/studio/clients/${clientId}`);
    return ok();
  });
}
