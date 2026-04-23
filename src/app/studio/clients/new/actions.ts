"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { type ActionResult, fail, ok, runAction } from "@/lib/actions";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { requireTrainer } from "@/lib/trainer";

const ALPHA = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I

function newCode(): string {
  let out = "";
  for (let i = 0; i < 6; i++) out += ALPHA[Math.floor(Math.random() * ALPHA.length)];
  return out;
}

const inviteSchema = z.object({
  displayName: z.string().max(80).optional().or(z.literal("")),
  email: z.string().email().optional().or(z.literal("")),
  phone: z.string().max(40).optional().or(z.literal("")),
  notes: z.string().max(2000).optional().or(z.literal("")),
});

/**
 * Creates a single-use invite. Trainer shares the returned code (as a URL)
 * with the client — see /invite/[code] — who then signs up or signs in
 * and claims it, creating their real `clients` row.
 */
export async function createInvite(raw: unknown): Promise<ActionResult<{ code: string }>> {
  return runAction(inviteSchema, raw, async (values) => {
    const trainer = await requireTrainer();
    const admin = createSupabaseAdminClient();

    for (let attempt = 0; attempt < 5; attempt++) {
      const code = newCode();
      const { error } = await admin.from("client_invites").insert({
        code,
        tenant_id: trainer.id,
        display_name: values.displayName || null,
        email: values.email || null,
        phone: values.phone || null,
        notes: values.notes || null,
      });
      if (!error) {
        revalidatePath("/studio/clients");
        return ok({ code });
      }
      if (error.code !== "23505") return fail(error.message);
    }
    return fail("Could not generate a code — try again.");
  });
}

/**
 * Revokes an unclaimed invite. No-op if already claimed.
 */
export async function revokeInvite(code: string): Promise<ActionResult<void>> {
  return runAction(z.string().length(6), code, async (code) => {
    const trainer = await requireTrainer();
    const admin = createSupabaseAdminClient();
    const { error } = await admin
      .from("client_invites")
      .delete()
      .eq("code", code)
      .eq("tenant_id", trainer.id)
      .is("claimed_at", null);
    if (error) return fail(error.message);
    revalidatePath("/studio/clients");
    return ok();
  });
}
