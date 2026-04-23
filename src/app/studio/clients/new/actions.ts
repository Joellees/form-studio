"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { type ActionResult, fail, ok, runAction } from "@/lib/actions";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { requireTrainer } from "@/lib/trainer";

/**
 * Look up a pending client by code so the trainer sees who they&rsquo;re
 * adding before they commit. Doesn&rsquo;t mutate anything.
 */
export async function lookupClientCode(
  raw: unknown,
): Promise<ActionResult<{ email: string | null; displayName: string | null }>> {
  return runAction(z.string().length(6), raw, async (code) => {
    await requireTrainer();
    const admin = createSupabaseAdminClient();
    const { data, error } = await admin
      .from("pending_clients")
      .select("email, display_name, claimed_by")
      .eq("code", code.toUpperCase())
      .maybeSingle();
    if (error) return fail(error.message);
    if (!data) return fail("No one with that code. Double-check with your client.");
    if (data.claimed_by) return fail("This code has already been used.");
    return ok({ email: data.email, displayName: data.display_name });
  });
}

const claimSchema = z.object({
  code: z.string().length(6).transform((s) => s.toUpperCase()),
  displayName: z.string().min(1, "Required").max(80),
  phone: z.string().max(40).optional().or(z.literal("")),
  notes: z.string().max(2000).optional().or(z.literal("")),
});

/**
 * Trainer claims a client code. Creates the `clients` row with the
 * trainer&rsquo;s tenant_id and the pending user&rsquo;s Clerk ID, then marks
 * the pending row as claimed so it can&rsquo;t be reused.
 */
export async function claimClientByCode(raw: unknown): Promise<ActionResult<{ id: string }>> {
  return runAction(claimSchema, raw, async (values) => {
    const trainer = await requireTrainer();
    const admin = createSupabaseAdminClient();

    const { data: pending, error: lookupErr } = await admin
      .from("pending_clients")
      .select("clerk_id, email, claimed_by")
      .eq("code", values.code)
      .maybeSingle();
    if (lookupErr) return fail(lookupErr.message);
    if (!pending) return fail("No one with that code.");
    if (pending.claimed_by) return fail("This code has already been used.");

    // Check the Clerk user isn&rsquo;t already a client elsewhere
    const { data: exists } = await admin
      .from("clients")
      .select("id")
      .eq("clerk_id", pending.clerk_id)
      .maybeSingle();
    if (exists) return fail("This person is already linked to a trainer.");

    const { data: client, error: insertErr } = await admin
      .from("clients")
      .insert({
        tenant_id: trainer.id,
        clerk_id: pending.clerk_id,
        display_name: values.displayName,
        email: pending.email,
        phone: values.phone || null,
        notes: values.notes || null,
      })
      .select("id")
      .single();
    if (insertErr) return fail(insertErr.message);

    // Seed default log-field toggles
    await admin.from("client_profile_fields").insert({
      client_id: client.id,
      tenant_id: trainer.id,
      weight: true,
    });

    // Mark the pending row claimed
    await admin
      .from("pending_clients")
      .update({ claimed_by: trainer.id, claimed_at: new Date().toISOString() })
      .eq("code", values.code);

    revalidatePath("/studio/clients");
    return ok({ id: client.id });
  });
}
