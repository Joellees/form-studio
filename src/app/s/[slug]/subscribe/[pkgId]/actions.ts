"use server";

import { auth } from "@clerk/nextjs/server";
import { addDays, formatISO } from "date-fns";
import { z } from "zod";

import { type ActionResult, fail, ok, runAction } from "@/lib/actions";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

const schema = z.object({
  packageId: z.string().uuid(),
  trainerId: z.string().uuid(),
  displayName: z.string().min(1),
  email: z.string().email().nullable(),
});

/**
 * Creates or links the client row for this Clerk user and registers a
 * pending subscription. Uses the admin client because:
 *   - the client doesn&rsquo;t have a `clients` row yet, so RLS has no basis
 *     to authorize the insert on their behalf;
 *   - we must be able to set `tenant_id` to the trainer determined by the
 *     package, and that value is not available through the RLS context.
 *
 * The action still authorizes the caller (Clerk session) and validates
 * the package → trainer linkage before writing.
 */
export async function subscribeToPackage(raw: unknown): Promise<ActionResult<{ subscriptionId: string }>> {
  return runAction(schema, raw, async ({ packageId, trainerId, displayName, email }) => {
    const { userId } = await auth();
    if (!userId) return fail("You must be signed in.");

    const admin = createSupabaseAdminClient();

    const { data: pkg } = await admin
      .from("packages")
      .select("id, tenant_id, session_count, duration_days, active")
      .eq("id", packageId)
      .maybeSingle();

    if (!pkg || !pkg.active || pkg.tenant_id !== trainerId) {
      return fail("This package is no longer available.");
    }

    // Upsert the client row keyed on clerk_id (globally unique).
    const { data: existing } = await admin
      .from("clients")
      .select("id, tenant_id")
      .eq("clerk_id", userId)
      .maybeSingle();

    let clientId: string;
    if (existing) {
      if (existing.tenant_id !== trainerId) {
        return fail("This account is already linked to a different trainer.");
      }
      clientId = existing.id;
    } else {
      const { data: inserted, error } = await admin
        .from("clients")
        .insert({
          tenant_id: trainerId,
          clerk_id: userId,
          display_name: displayName,
          email: email,
          active: true,
        })
        .select("id")
        .single();
      if (error) return fail(error.message);
      clientId = inserted.id;

      await admin.from("client_profile_fields").insert({
        client_id: clientId,
        tenant_id: trainerId,
        weight: true,
      });
    }

    const today = new Date();
    const { data: sub, error: subErr } = await admin
      .from("subscriptions")
      .insert({
        tenant_id: trainerId,
        client_id: clientId,
        package_id: packageId,
        start_date: formatISO(today, { representation: "date" }),
        end_date: formatISO(addDays(today, pkg.duration_days), { representation: "date" }),
        sessions_remaining: 0, // unlocked only when trainer marks as paid
        payment_status: "pending",
        payment_method: "manual",
      })
      .select("id")
      .single();

    if (subErr) return fail(subErr.message);
    return ok({ subscriptionId: sub.id });
  });
}
