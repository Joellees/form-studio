"use server";

import { auth, currentUser } from "@clerk/nextjs/server";
import { z } from "zod";

import { type ActionResult, fail, ok, runAction } from "@/lib/actions";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

const claimSchema = z.object({
  code: z.string().length(6),
  phone: z.string().min(3).max(40),
});

/**
 * Claims an unclaimed invite for the signed-in Clerk user. Requires a
 * phone number (enforced client-side too). Creates the `clients` row,
 * seeds default log-field toggles, and marks the invite as claimed.
 */
export async function claimInvite(raw: unknown): Promise<ActionResult<{ clientId: string }>> {
  return runAction(claimSchema, raw, async ({ code, phone }) => {
    const { userId } = await auth();
    if (!userId) return fail("You need to sign in or sign up first.");

    const admin = createSupabaseAdminClient();

    const { data: invite } = await admin
      .from("client_invites")
      .select("code, tenant_id, email, display_name, notes, claimed_at")
      .eq("code", code.toUpperCase())
      .maybeSingle();
    if (!invite) return fail("This invite link isn&rsquo;t valid.");
    if (invite.claimed_at) return fail("This invite has already been used.");

    // If the user is already a client of another trainer, block.
    const { data: existing } = await admin
      .from("clients")
      .select("id, tenant_id")
      .eq("clerk_id", userId)
      .maybeSingle();
    if (existing && existing.tenant_id !== invite.tenant_id) {
      return fail("This account is already linked to a different trainer.");
    }

    let clientId: string;
    if (existing) {
      // Same trainer — just update phone on their existing row.
      clientId = existing.id;
      await admin.from("clients").update({ phone }).eq("id", clientId);
    } else {
      const user = await currentUser();
      const email = invite.email || user?.primaryEmailAddress?.emailAddress || null;
      const displayName =
        invite.display_name || user?.firstName || user?.fullName || user?.username || "Client";

      const { data: inserted, error } = await admin
        .from("clients")
        .insert({
          tenant_id: invite.tenant_id,
          clerk_id: userId,
          display_name: displayName,
          email,
          phone,
          notes: invite.notes ?? null,
        })
        .select("id")
        .single();
      if (error) return fail(error.message);
      clientId = inserted.id;

      await admin.from("client_profile_fields").insert({
        client_id: clientId,
        tenant_id: invite.tenant_id,
        weight: true,
      });
    }

    await admin
      .from("client_invites")
      .update({ claimed_by_clerk_id: userId, claimed_at: new Date().toISOString() })
      .eq("code", invite.code);

    return ok({ clientId });
  });
}
