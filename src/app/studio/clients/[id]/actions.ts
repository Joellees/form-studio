"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { type ActionResult, fail, ok, runAction } from "@/lib/actions";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
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
    const admin = createSupabaseAdminClient();

    const { error } = await admin
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

const detailsSchema = z.object({
  id: z.string().uuid(),
  displayName: z.string().min(1).max(80),
  email: z.string().email().nullable().or(z.literal("").transform(() => null)),
  phone: z.string().max(40).nullable().or(z.literal("").transform(() => null)),
  notes: z.string().max(4000).nullable().or(z.literal("").transform(() => null)),
  goals: z.string().max(2000).nullable().or(z.literal("").transform(() => null)),
  injuries: z.string().max(2000).nullable().or(z.literal("").transform(() => null)),
});

/**
 * Edits the trainer-facing fields on a client row. Scoped to the
 * trainer's tenant so two studios can't read or write each other's rows.
 */
export async function updateClientDetails(raw: unknown): Promise<ActionResult<void>> {
  return runAction(detailsSchema, raw, async ({ id, displayName, email, phone, notes, goals, injuries }) => {
    const trainer = await requireTrainer();
    const admin = createSupabaseAdminClient();
    const { error } = await admin
      .from("clients")
      .update({
        display_name: displayName,
        email,
        phone,
        notes,
        goals,
        injuries,
      })
      .eq("id", id)
      .eq("tenant_id", trainer.id);
    if (error) return fail(error.message);
    revalidatePath("/studio/clients");
    revalidatePath(`/studio/clients/${id}`);
    return ok();
  });
}
