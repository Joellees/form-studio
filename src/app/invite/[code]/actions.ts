"use server";

import { auth, currentUser } from "@clerk/nextjs/server";
import { cookies } from "next/headers";
import { z } from "zod";

import { type ActionResult, fail, ok, runAction } from "@/lib/actions";
import { BETA_COOKIE, parseBetaCodes } from "@/lib/beta";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { CLIENT_TENANT_COOKIE } from "@/lib/trainer";

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
      .select(
        "code, tenant_id, email, display_name, notes, claimed_at, package_id, packages(id, name, session_count, duration_days, price_usd)",
      )
      .eq("code", code.toUpperCase())
      .maybeSingle();
    if (!invite) return fail("This invite link isn&rsquo;t valid.");
    if (invite.claimed_at) return fail("This invite has already been used.");

    // A Clerk user can be a client of any number of trainers; we only
    // dedupe within the same studio. Look up an existing membership
    // for THIS trainer specifically — not across all of them.
    const { data: existing } = await admin
      .from("clients")
      .select("id")
      .eq("clerk_id", userId)
      .eq("tenant_id", invite.tenant_id)
      .maybeSingle();

    let clientId: string;
    if (existing) {
      // Same studio — just update phone on the existing row.
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
      if (error) {
        // The legacy unique(clerk_id) constraint is gone post-migration
        // 0003. If we hit it again, it means the migration hasn't been
        // applied — surface that explicitly so the trainer or admin
        // knows what to do instead of the raw Postgres message.
        if (error.message?.includes("clients_clerk_id_key")) {
          return fail(
            "Multi-trainer support isn&rsquo;t enabled yet on this database. Ask the admin to run migration 0003.",
          );
        }
        return fail(error.message);
      }
      clientId = inserted.id;

      await admin.from("client_profile_fields").insert({
        client_id: clientId,
        tenant_id: invite.tenant_id,
        weight: true,
      });
    }

    // If the trainer attached a package to this invite, create the
    // first month's subscription on the client's behalf so they land
    // in their portal with their plan already set up. Marked as
    // pending until payment is recorded (Phase 2 Stripe integration).
    if (invite.package_id) {
      const pkg = Array.isArray(invite.packages) ? invite.packages[0] : invite.packages;
      if (pkg) {
        const today = new Date();
        const nextMonth = new Date(today);
        nextMonth.setMonth(nextMonth.getMonth() + 1);
        const { data: existingSub } = await admin
          .from("subscriptions")
          .select("id")
          .eq("client_id", clientId)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (!existingSub) {
          await admin.from("subscriptions").insert({
            tenant_id: invite.tenant_id,
            client_id: clientId,
            package_id: invite.package_id,
            start_date: today.toISOString().slice(0, 10),
            end_date: nextMonth.toISOString().slice(0, 10),
            sessions_remaining: 0,
            payment_status: "pending",
            payment_method: "manual",
            auto_renew: false,
            next_renewal_date: nextMonth.toISOString().slice(0, 10),
          });
        }
      }
    }

    await admin
      .from("client_invites")
      .update({ claimed_by_clerk_id: userId, claimed_at: new Date().toISOString() })
      .eq("code", invite.code);

    const jar = await cookies();

    // Pin the active studio to the one just claimed so the post-claim
    // redirect to /client lands on the right portal — even if the user
    // is also a client of other trainers.
    jar.set(CLIENT_TENANT_COOKIE, invite.tenant_id, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 60,
    });

    // Grant beta-gate access. The invite IS the beta pass — dropping a
    // valid code cookie lets the user navigate the rest of the app
    // after claiming without needing a separately-shared beta code.
    const validCodes = parseBetaCodes(process.env.BETA_CODES);
    if (validCodes.length > 0) {
      const anyCode = validCodes[0]?.code;
      if (anyCode) {
        jar.set(BETA_COOKIE, anyCode, {
          httpOnly: true,
          secure: process.env.NODE_ENV === "production",
          sameSite: "lax",
          path: "/",
          maxAge: 60 * 60 * 24 * 30,
        });
      }
    }

    return ok({ clientId });
  });
}
